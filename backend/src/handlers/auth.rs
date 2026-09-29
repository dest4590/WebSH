use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;

use super::common::{authenticate_user, map_auth_error};
use crate::{
    auth::{AuthRequest, AuthResponse, AuthUser, ErrorResponse, RefreshRequest},
    state::AppState,
};

pub async fn health_handler() -> &'static str {
    "ok"
}

pub async fn register_handler(
    State(state): State<AppState>,
    Json(payload): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .auth
        .register(payload)
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn login_handler(
    State(state): State<AppState>,
    Json(payload): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .auth
        .login(payload)
        .await
        .map(Json)
        .map_err(map_auth_error)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeTunnelNode {
    pub name: String,
    pub tier: String,
    pub comment: Option<String>,
}

pub async fn list_nodes_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<SafeTunnelNode>>, (StatusCode, Json<ErrorResponse>)> {
    let nodes = state.tunnel_nodes.lock().await;
    let safe_nodes = nodes
        .iter()
        .map(|n| SafeTunnelNode {
            name: n.name.clone(),
            tier: n.tier.clone(),
            comment: n.comment.clone(),
        })
        .collect();
    Ok(Json(safe_nodes))
}

pub async fn refresh_handler(
    State(state): State<AppState>,
    Json(payload): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    state
        .auth
        .refresh(&payload.refresh_token)
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn me_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuthUser>, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;
    Ok(Json(caller))
}

#[derive(Deserialize)]
pub struct UpdateProfilePayload {
    pub name: String,
}

pub async fn update_me_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<AuthUser>, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;
    state
        .auth
        .update_name(caller.id, payload.name)
        .await
        .map(Json)
        .map_err(map_auth_error)
}
