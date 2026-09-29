pub mod news;
pub mod user;

use serde::Serialize;

pub use user::{
    AuthClaims, AuthError, AuthRequest, AuthResponse, AuthUser, RefreshRequest, StoredUser,
};

pub use news::{Comment, NewsItem, NewsWithDetails, ReactionCount};

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

impl ErrorResponse {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            error: message.into(),
        }
    }
}
