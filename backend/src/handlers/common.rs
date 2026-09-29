use axum::{
    Json,
    http::{HeaderMap, StatusCode},
};

use crate::log;
use crate::{
    auth::{AuthError, AuthUser, ErrorResponse, extract_bearer_token},
    state::AppState,
};

pub async fn authenticate_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthUser, (StatusCode, Json<ErrorResponse>)> {
    let token = require_bearer_token(headers)?;
    state
        .auth
        .authenticate_token(token)
        .await
        .map_err(map_auth_error)
}

pub async fn require_admin(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthUser, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(state, headers).await?;
    if caller.is_admin {
        Ok(caller)
    } else {
        Err((StatusCode::FORBIDDEN, Json(ErrorResponse::new("forbidden"))))
    }
}

pub fn require_bearer_token(
    headers: &HeaderMap,
) -> Result<&str, (StatusCode, Json<ErrorResponse>)> {
    extract_bearer_token(headers).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse::new("Missing bearer token.")),
        )
    })
}

pub fn map_auth_error(error: AuthError) -> (StatusCode, Json<ErrorResponse>) {
    let status = error.status_code();
    if status == StatusCode::INTERNAL_SERVER_ERROR {
        log::error(&error.log_message());
    }
    (status, Json(ErrorResponse::new(error.user_message())))
}

#[must_use]
pub fn map_ws_auth_error(error: AuthError) -> (StatusCode, &'static str) {
    let status = error.status_code();
    if status == StatusCode::INTERNAL_SERVER_ERROR {
        log::error(&error.log_message());
        return (StatusCode::INTERNAL_SERVER_ERROR, "internal auth error");
    }

    (status, "unauthorized")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatus {
    pub name: String,
    pub status: String, // "online" | "offline"
    pub tier: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatPayload {
    pub name: String,
    pub secret: String,
}

pub async fn node_status_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Json<Vec<NodeStatus>> {
    let nodes = state.tunnel_nodes.lock().await;
    let now = tokio::time::Instant::now();
    let status = nodes
        .iter()
        .map(|n| {
            let is_online = n
                .last_seen
                .is_some_and(|ls| now.duration_since(ls).as_secs() < 60);
            NodeStatus {
                name: n.name.clone(),
                status: if is_online {
                    "online".to_string()
                } else {
                    "offline".to_string()
                },
                tier: n.tier.clone(),
            }
        })
        .collect();
    Json(status)
}

pub async fn heartbeat_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(payload): Json<HeartbeatPayload>,
) -> Result<StatusCode, (StatusCode, &'static str)> {
    if payload.secret != state.tunnel_secret {
        return Err((StatusCode::UNAUTHORIZED, "invalid secret"));
    }

    let mut nodes = state.tunnel_nodes.lock().await;
    if let Some(node) = nodes.iter_mut().find(|n| n.name == payload.name) {
        node.last_seen = Some(tokio::time::Instant::now());
        Ok(StatusCode::OK)
    } else {
        Err((StatusCode::NOT_FOUND, "node not found"))
    }
}

pub const ALLOWED_SYNC_TYPES: &[&str] = &["snippets", "settings", "servers"];
pub const SYNC_MAX_PAYLOAD_BYTES: usize = 5 * 1024 * 1024;

pub async fn index_handler() -> (axum::http::StatusCode, String) {
    (axum::http::StatusCode::OK, "websh-backend".to_string())
}
