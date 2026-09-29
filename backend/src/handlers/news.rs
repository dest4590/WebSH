use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;

use super::common::{authenticate_user, map_auth_error, require_admin};
use crate::{
    auth::{Comment, ErrorResponse, NewsItem, NewsWithDetails, extract_bearer_token},
    state::AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNewsRequest {
    pub title: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddCommentRequest {
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCommentRequest {
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleReactionRequest {
    pub reaction: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditNewsRequest {
    pub title: String,
    pub content: String,
}

pub async fn list_news_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<NewsItem>>, (StatusCode, Json<ErrorResponse>)> {
    state
        .auth
        .list_news()
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn get_news_details_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(news_id): axum::extract::Path<i64>,
) -> Result<Json<NewsWithDetails>, (StatusCode, Json<ErrorResponse>)> {
    let user = match extract_bearer_token(&headers) {
        Some(token) => state.auth.authenticate_token(token).await.ok(),
        None => None,
    };

    state
        .auth
        .get_news_details(news_id, user.map(|u| u.id))
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn create_news_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateNewsRequest>,
) -> Result<Json<NewsItem>, (StatusCode, Json<ErrorResponse>)> {
    let _caller = require_admin(&state, &headers).await?;
    state
        .auth
        .create_news(_caller.id, payload.title, payload.content)
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn edit_news_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(news_id): axum::extract::Path<i64>,
    Json(payload): Json<EditNewsRequest>,
) -> Result<Json<NewsItem>, (StatusCode, Json<ErrorResponse>)> {
    let _caller = require_admin(&state, &headers).await?;
    state
        .auth
        .update_news(news_id, payload.title, payload.content)
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn add_comment_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(news_id): axum::extract::Path<i64>,
    Json(payload): Json<AddCommentRequest>,
) -> Result<Json<Comment>, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;
    state
        .auth
        .add_comment(news_id, caller.id, payload.content)
        .await
        .map(Json)
        .map_err(map_auth_error)
}

pub async fn toggle_reaction_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(news_id): axum::extract::Path<i64>,
    Json(payload): Json<ToggleReactionRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;
    state
        .auth
        .toggle_reaction(news_id, caller.id, payload.reaction)
        .await
        .map(|()| StatusCode::OK)
        .map_err(map_auth_error)
}

pub async fn delete_comment_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((news_id, comment_id)): axum::extract::Path<(i64, i64)>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;

    let comment = state
        .auth
        .get_comment(comment_id)
        .await
        .map_err(map_auth_error)?;

    if comment.news_id != news_id {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new(
                "Comment does not belong to this news item.",
            )),
        ));
    }

    if comment.user_id != caller.id && !caller.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(ErrorResponse::new("forbidden"))));
    }

    state
        .auth
        .delete_comment(comment_id)
        .await
        .map(|()| StatusCode::NO_CONTENT)
        .map_err(map_auth_error)
}

pub async fn update_comment_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((news_id, comment_id)): axum::extract::Path<(i64, i64)>,
    Json(payload): Json<UpdateCommentRequest>,
) -> Result<Json<Comment>, (StatusCode, Json<ErrorResponse>)> {
    let caller = authenticate_user(&state, &headers).await?;

    let comment = state
        .auth
        .get_comment(comment_id)
        .await
        .map_err(map_auth_error)?;

    if comment.news_id != news_id {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse::new(
                "Comment does not belong to this news item.",
            )),
        ));
    }

    if comment.user_id != caller.id && !caller.is_admin {
        return Err((StatusCode::FORBIDDEN, Json(ErrorResponse::new("forbidden"))));
    }

    state
        .auth
        .update_comment(comment_id, payload.content)
        .await
        .map(Json)
        .map_err(map_auth_error)
}
