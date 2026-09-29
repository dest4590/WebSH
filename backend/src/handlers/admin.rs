use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;

use super::common::{map_auth_error, require_admin};
use crate::{
    auth::{AuthUser, ErrorResponse},
    state::{self, AppState},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSubscriptionPayload {
    pub subscription_tier: Option<String>,
    pub subscription_start: Option<i64>,
    pub subscription_end: Option<i64>,
    pub is_admin: Option<bool>,
}

pub async fn admin_list_users_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<AuthUser>>, (StatusCode, Json<ErrorResponse>)> {
    require_admin(&state, &headers).await?;
    state
        .auth
        .list_users()
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn admin_list_nodes_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<state::TunnelNode>>, (StatusCode, Json<ErrorResponse>)> {
    require_admin(&state, &headers).await?;
    let nodes = state.tunnel_nodes.lock().await;
    Ok(Json(nodes.clone()))
}

pub async fn admin_update_subscription_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(user_id): axum::extract::Path<i64>,
    Json(payload): Json<UpdateSubscriptionPayload>,
) -> Result<Json<AuthUser>, (StatusCode, Json<ErrorResponse>)> {
    require_admin(&state, &headers).await?;

    let tier = payload
        .subscription_tier
        .unwrap_or_else(|| "free".to_string());

    state
        .auth
        .update_subscription(
            user_id,
            tier,
            payload.subscription_start,
            payload.subscription_end,
            payload.is_admin,
        )
        .await
        .map(Json)
        .map_err(map_auth_error)
}
