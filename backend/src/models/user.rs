use axum::http::StatusCode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AuthRequest {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub subscription_tier: String,
    pub subscription_start: Option<i64>,
    pub subscription_end: Option<i64>,
    pub is_admin: bool,
    pub created_at: i64,
}

impl From<StoredUser> for AuthUser {
    fn from(value: StoredUser) -> Self {
        Self {
            id: value.id,
            email: value.email,
            name: value.name,
            subscription_tier: value.subscription_tier,
            subscription_start: value.subscription_start,
            subscription_end: value.subscription_end,
            is_admin: value.is_admin != 0,
            created_at: value.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub token: String,
    pub refresh_token: String,
    pub user: AuthUser,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, sqlx::FromRow)]
pub struct StoredUser {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub password_hash: String,
    pub subscription_tier: String,
    pub subscription_start: Option<i64>,
    pub subscription_end: Option<i64>,
    pub is_admin: i32,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthClaims {
    pub sub: i64,
    pub email: String,
    pub tier: String,
    pub admin: bool,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Debug)]
pub enum AuthError {
    Validation(String),
    DuplicateEmail,
    InvalidCredentials,
    InvalidToken,
    NotFound(String),
    Storage(String),
}

impl AuthError {
    #[must_use]
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::DuplicateEmail => StatusCode::CONFLICT,
            Self::InvalidCredentials | Self::InvalidToken => StatusCode::UNAUTHORIZED,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Storage(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    #[must_use]
    pub fn user_message(&self) -> String {
        match self {
            Self::Validation(message) => message.clone(),
            Self::DuplicateEmail => "An account with that email already exists.".to_owned(),
            Self::InvalidCredentials => "Invalid email or password.".to_owned(),
            Self::InvalidToken => "Your session is invalid or expired.".to_owned(),
            Self::NotFound(message) => message.clone(),
            Self::Storage(_) => "Authentication service unavailable.".to_owned(),
        }
    }

    #[must_use]
    pub fn log_message(&self) -> String {
        match self {
            Self::Storage(message) => message.clone(),
            _ => self.user_message(),
        }
    }
}
