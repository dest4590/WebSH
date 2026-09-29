use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

use super::common::{
    ALLOWED_SYNC_TYPES, SYNC_MAX_PAYLOAD_BYTES, authenticate_user, map_auth_error,
};
use crate::{models::ErrorResponse, state::AppState};

#[derive(serde::Serialize)]
pub struct GetSyncResponse {
    pub encrypted_payload: serde_json::Value,
}

#[derive(serde::Deserialize)]
pub struct PutSyncPayload {
    pub encrypted_payload: serde_json::Value,
}

pub async fn get_sync_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(data_type): axum::extract::Path<String>,
) -> Result<Json<GetSyncResponse>, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;

    if caller.subscription_tier == "free" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse::new(
                "Sync requires a Pro or Team subscription.",
            )),
        ));
    }

    if !ALLOWED_SYNC_TYPES.contains(&data_type.as_str()) {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("Unknown sync data type.")),
        ));
    }

    match state.auth.get_sync_data(caller.id, data_type).await {
        Ok(Some(payload)) => Ok(Json(GetSyncResponse {
            encrypted_payload: serde_json::from_str(&payload).map_err(|e| {
                let err = format!("Failed to parse stored sync payload: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse::new(&err)),
                )
            })?,
        })),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("No data synced yet.")),
        )),
        Err(e) => Err(map_auth_error(e)),
    }
}

pub async fn put_sync_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(data_type): axum::extract::Path<String>,
    Json(payload): Json<PutSyncPayload>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;

    if caller.subscription_tier == "free" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse::new(
                "Sync requires a Pro or Team subscription.",
            )),
        ));
    }

    if !ALLOWED_SYNC_TYPES.contains(&data_type.as_str()) {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse::new("Unknown sync data type.")),
        ));
    }

    let payload_text = serde_json::to_string(&payload.encrypted_payload).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new(format!("Invalid sync payload: {e}"))),
        )
    })?;

    if payload_text.len() > SYNC_MAX_PAYLOAD_BYTES {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(ErrorResponse::new("Sync payload exceeds 5 MB limit.")),
        ));
    }

    state
        .auth
        .put_sync_data(caller.id, data_type, payload_text)
        .await
        .map(|()| StatusCode::NO_CONTENT)
        .map_err(map_auth_error)
}
