use axum::{
    extract::{Query, State, ws::CloseFrame, ws::Message, ws::WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};

use super::common::map_ws_auth_error;
use crate::{
    auth::extract_bearer_token,
    state::{self, AppState, WsQuery},
};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, &'static str)> {
    if let Some(ref allowed) = state.allowed_origin {
        let origin = headers
            .get("origin")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !allowed
            .iter()
            .any(|allowed_origin| allowed_origin == origin)
        {
            crate::log::warn(&format!(
                "ws blocked: origin='{}' does not match allowed='{}'",
                origin,
                allowed.join(","),
            ));
            return Err((StatusCode::FORBIDDEN, "forbidden origin"));
        }
    }

    let user = match query
        .token
        .as_deref()
        .or_else(|| extract_bearer_token(&headers))
    {
        Some(token) => Some(
            state
                .auth
                .authenticate_token(token)
                .await
                .map_err(map_ws_auth_error)?,
        ),
        None => None,
    };

    if let Err(e) = state::validate_target(&query) {
        crate::log::warn(&format!(
            "ws validation failed: host={} port={} -> {:?}",
            query.host, query.port, e,
        ));
        return Err(e);
    }

    let user_label = user
        .as_ref()
        .map_or_else(|| "guest".to_string(), |value| value.email.clone());

    let user_tier_owned = user
        .as_ref()
        .map_or_else(|| "free".to_string(), |u| u.subscription_tier.clone());

    let user_clone = user.clone();

    let selected_node = {
        let nodes = state.tunnel_nodes.lock().await;
        select_tunnel_node(&nodes, &user_tier_owned, query.preferred_node.as_deref())
            .ok_or((StatusCode::SERVICE_UNAVAILABLE, "no tunnel nodes available"))?
    };

    crate::log::info(&format!(
        "incoming ws request user={} tier={} host={} port={} node={}",
        user_label, user_tier_owned, query.host, query.port, selected_node.url
    ));

    let tunnel_secret = state.tunnel_secret.clone();
    let user_connections = state.user_connections.clone();
    let connection_limit = state.connection_limit.clone();

    Ok(ws
        .max_message_size(1024 * 1024)
        .max_frame_size(256 * 1024)
        .on_upgrade(move |mut socket| {
            let query = query.clone();
            let selected_node = selected_node.clone();
            let tunnel_secret = tunnel_secret.clone();
            let connection_limit = connection_limit.clone();
            let user_connections = user_connections.clone();
            let user_tier = user_tier_owned.clone();
            let user = user_clone.clone();

            async move {
                if user_tier == "free" {
                    let uid = user.as_ref().map_or(0, |u| u.id);
                    {
                        let mut map = user_connections.lock().await;
                        let count = map.get(&uid).copied().unwrap_or(0);
                        if count >= 2 {
                            let _ = socket.send(Message::Close(Some(CloseFrame { code: 1008u16, reason: "Subscription required: free plan allows 2 concurrent sessions.".into() }))).await;
                            return;
                        }
                        map.insert(uid, count + 1);
                    }

                    let permit = if let Ok(p) = connection_limit.clone().try_acquire_owned() { p } else {
                        let mut map = user_connections.lock().await;
                        let count = map.get(&uid).copied().unwrap_or(1);
                        if count <= 1 {
                            map.remove(&uid);
                        } else {
                            map.insert(uid, count - 1);
                        }
                        let _ = socket.send(Message::Close(Some(CloseFrame { code: 1013u16, reason: "Server overloaded: connection limit reached".into() }))).await;
                        return;
                    };

                    crate::tunnel::handle_socket(socket, query, permit, user, selected_node, tunnel_secret, Some(user_connections.clone())).await;

                    let mut map = user_connections.lock().await;
                    let count = map.get(&uid).copied().unwrap_or(1);
                    if count <= 1 {
                        map.remove(&uid);
                    } else {
                        map.insert(uid, count - 1);
                    }
                    return;
                }

                let Ok(permit) = connection_limit.try_acquire_owned() else {
                    let _ = socket.send(Message::Close(Some(CloseFrame { code: 1013u16, reason: "Server overloaded: connection limit reached".into() }))).await;
                    return;
                };

                crate::tunnel::handle_socket(socket, query, permit, user, selected_node, tunnel_secret, None).await;
            }
        }))
}

fn select_tunnel_node(
    nodes: &[state::TunnelNode],
    user_tier: &str,
    preferred_node: Option<&str>,
) -> Option<state::TunnelNode> {
    let now = tokio::time::Instant::now();
    let online_nodes: Vec<_> = nodes
        .iter()
        .filter(|n| {
            n.last_seen
                .is_some_and(|ls| now.duration_since(ls).as_secs() < 60)
        })
        .collect();

    if online_nodes.is_empty() {
        return None;
    }

    let eligible_nodes: Vec<_> = online_nodes
        .iter()
        .copied()
        .filter(|n| n.tier == user_tier)
        .cloned()
        .collect();

    let mut fallback_nodes: Vec<_> = Vec::new();
    if user_tier == "pro" {
        fallback_nodes = online_nodes
            .iter()
            .copied()
            .filter(|n| n.tier == "free")
            .cloned()
            .collect();
    }

    fn choose_node(
        nodes: &[state::TunnelNode],
        preferred_node: Option<&str>,
    ) -> Option<state::TunnelNode> {
        if let Some(pref) = preferred_node {
            if let Some(node) = nodes.iter().find(|n| n.name == pref) {
                return Some(node.clone());
            }
        }
        nodes.first().cloned()
    }

    if let Some(node) = choose_node(&eligible_nodes, preferred_node) {
        return Some(node);
    }

    if user_tier == "pro" {
        if let Some(node) = choose_node(&fallback_nodes, preferred_node) {
            return Some(node);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::select_tunnel_node;
    use crate::state::TunnelNode;

    fn online_node(name: &str, tier: &str) -> TunnelNode {
        TunnelNode {
            name: name.to_string(),
            url: format!("https://{name}.example.com"),
            tier: tier.to_string(),
            comment: None,
            last_seen: Some(tokio::time::Instant::now()),
        }
    }

    #[test]
    fn free_users_cannot_select_pro_preferred_node() {
        let nodes = vec![online_node("free-a", "free"), online_node("pro-a", "pro")];

        let selected = select_tunnel_node(&nodes, "free", Some("pro-a"))
            .expect("free users should still receive an eligible node");

        assert_eq!(selected.name, "free-a");
        assert_eq!(selected.tier, "free");
    }

    #[test]
    fn free_users_do_not_fallback_to_pro_nodes() {
        let nodes = vec![online_node("pro-a", "pro")];

        let selected = select_tunnel_node(&nodes, "free", None);

        assert!(selected.is_none());
    }

    #[test]
    fn pro_users_can_fallback_to_free_nodes() {
        let nodes = vec![online_node("free-a", "free")];

        let selected = select_tunnel_node(&nodes, "pro", None)
            .expect("pro user should fallback to free nodes when no pro nodes exist");

        assert_eq!(selected.name, "free-a");
        assert_eq!(selected.tier, "free");
    }
}
