use std::{
    path::Path,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{
        SaltString,
        rand_core::{OsRng, RngCore},
    },
};
use axum::http::HeaderMap;
use jsonwebtoken::{DecodingKey, EncodingKey};
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use std::str::FromStr;

use crate::models::{AuthError, StoredUser};

pub fn extract_bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

const DEFAULT_DB_PATH: &str = "data/websh-auth.sqlite";
const DEFAULT_JWT_SECRET: &str = "dev-only-change-me-before-deploy";
const DEFAULT_JWT_TTL_HOURS: u64 = 12;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS: u64 = 30;
const REFRESH_TOKEN_BYTES: usize = 32;
const MIN_PASSWORD_LENGTH: usize = 8;
const MAX_PASSWORD_LENGTH: usize = 128;

fn resolve_jwt_secret(raw_secret: Option<String>) -> Result<String, String> {
    let secret = raw_secret
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "AUTH_JWT_SECRET must be set to a long random secret; refusing insecure startup"
                .to_owned()
        })?;

    if secret == DEFAULT_JWT_SECRET {
        return Err(
            "AUTH_JWT_SECRET is set to the known placeholder value; refusing insecure startup"
                .to_owned(),
        );
    }

    Ok(secret)
}

#[derive(Clone)]
pub struct AuthState {
    pub database: SqlitePool,
    pub encoding_key: Arc<EncodingKey>,
    pub decoding_key: Arc<DecodingKey>,
    pub jwt_ttl: Duration,
    pub refresh_token_ttl: Duration,
}

impl AuthState {
    pub async fn from_env() -> Result<Self, String> {
        let database_path = std::env::var("AUTH_DB_PATH")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_DB_PATH.to_owned());

        if let Some(parent) = Path::new(&database_path).parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create auth database directory: {error}"))?;
        }

        let options = SqliteConnectOptions::from_str(&format!("sqlite://{database_path}"))
            .map_err(|error| format!("failed to parse sqlite url: {error}"))?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|error| format!("failed to create database pool: {error}"))?;

        sqlx::raw_sql(
            "
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                subscription_tier TEXT NOT NULL DEFAULT 'free',
                is_admin INTEGER NOT NULL DEFAULT 0,
                subscription_start INTEGER NULL,
                subscription_end INTEGER NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sync_data (
                user_id INTEGER NOT NULL,
                data_type TEXT NOT NULL,
                encrypted_payload TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, data_type)
            );
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (author_id) REFERENCES users (id)
            );
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                news_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (news_id) REFERENCES news (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            );
            CREATE TABLE IF NOT EXISTS reactions (
                news_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                reaction TEXT NOT NULL,
                PRIMARY KEY (news_id, user_id, reaction),
                FOREIGN KEY (news_id) REFERENCES news (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            );
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );
            ",
        )
        .execute(&pool)
        .await
        .map_err(|error| format!("failed to initialize auth schema: {error}"))?;

        let jwt_secret = resolve_jwt_secret(std::env::var("AUTH_JWT_SECRET").ok())?;

        let jwt_ttl_hours = std::env::var("AUTH_JWT_TTL_HOURS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_JWT_TTL_HOURS);

        let refresh_token_ttl_days = std::env::var("AUTH_REFRESH_TTL_DAYS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_REFRESH_TOKEN_TTL_DAYS);

        Ok(Self {
            database: pool,
            encoding_key: Arc::new(EncodingKey::from_secret(jwt_secret.as_bytes())),
            decoding_key: Arc::new(DecodingKey::from_secret(jwt_secret.as_bytes())),
            jwt_ttl: Duration::from_secs(jwt_ttl_hours * 60 * 60),
            refresh_token_ttl: Duration::from_secs(refresh_token_ttl_days * 24 * 60 * 60),
        })
    }

    fn generate_refresh_token(&self) -> Result<String, AuthError> {
        let mut random_bytes = [0u8; REFRESH_TOKEN_BYTES];
        OsRng.fill_bytes(&mut random_bytes);

        let token = random_bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();

        Ok(token)
    }

    pub async fn create_refresh_token(&self, user_id: i64) -> Result<String, AuthError> {
        let token = self.generate_refresh_token()?;
        let now = unix_timestamp();
        let expires_at = now + self.refresh_token_ttl.as_secs() as i64;

        sqlx::query(
            "INSERT INTO refresh_tokens (token, user_id, expires_at, revoked, created_at) VALUES (?1, ?2, ?3, 0, ?4)",
        )
        .bind(&token)
        .bind(user_id)
        .bind(expires_at)
        .bind(now)
        .execute(&self.database)
        .await
        .map_err(|error| AuthError::Storage(format!("failed to store refresh token: {error}")))?;

        Ok(token)
    }

    pub(super) async fn authenticate_refresh_token(
        &self,
        token: &str,
    ) -> Result<StoredRefreshToken, AuthError> {
        let refresh_token = sqlx::query_as::<_, StoredRefreshToken>(
            "SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token = ?1",
        )
        .bind(token)
        .fetch_optional(&self.database)
        .await
        .map_err(|error| AuthError::Storage(format!("failed to query refresh token: {error}")))?
        .ok_or(AuthError::InvalidToken)?;

        let now = unix_timestamp();
        if refresh_token.revoked != 0 || refresh_token.expires_at < now {
            return Err(AuthError::InvalidToken);
        }

        Ok(refresh_token)
    }

    pub async fn invalidate_refresh_token(&self, token: &str) -> Result<(), AuthError> {
        sqlx::query("UPDATE refresh_tokens SET revoked = 1 WHERE token = ?1")
            .bind(token)
            .execute(&self.database)
            .await
            .map_err(|error| {
                AuthError::Storage(format!("failed to revoke refresh token: {error}"))
            })?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_JWT_SECRET, resolve_jwt_secret};

    #[test]
    fn rejects_missing_jwt_secret() {
        assert!(resolve_jwt_secret(None).is_err());
    }

    #[test]
    fn rejects_placeholder_jwt_secret() {
        assert!(resolve_jwt_secret(Some(DEFAULT_JWT_SECRET.to_string())).is_err());
    }

    #[test]
    fn accepts_non_placeholder_jwt_secret() {
        let secret = resolve_jwt_secret(Some("replace-with-real-random-value".to_string()))
            .expect("expected custom secret to be accepted");

        assert_eq!(secret, "replace-with-real-random-value");
    }
}

pub(super) fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub(super) fn normalize_email(email: &str) -> Result<String, AuthError> {
    let normalized = email.trim().to_lowercase();
    if normalized.is_empty() || !normalized.contains('@') {
        return Err(AuthError::Validation(
            "Enter a valid email address.".to_owned(),
        ));
    }

    let mut parts = normalized.split('@');
    let local = parts.next().unwrap_or_default();
    let domain = parts.next().unwrap_or_default();
    if parts.next().is_some() || local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return Err(AuthError::Validation(
            "Enter a valid email address.".to_owned(),
        ));
    }

    Ok(normalized)
}

pub(super) fn validate_password(password: &str) -> Result<(), AuthError> {
    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(AuthError::Validation(format!(
            "Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )));
    }

    if password.len() > MAX_PASSWORD_LENGTH {
        return Err(AuthError::Validation(format!(
            "Password must be at most {MAX_PASSWORD_LENGTH} characters."
        )));
    }

    Ok(())
}

pub(super) fn hash_password(password: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| AuthError::Storage(format!("failed to hash password: {error}")))
}

pub(super) fn verify_password(password: &str, password_hash: &str) -> Result<(), AuthError> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|error| AuthError::Storage(format!("failed to parse password hash: {error}")))?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| AuthError::InvalidCredentials)
}

pub(super) async fn find_user_by_email(
    pool: &SqlitePool,
    email: &str,
) -> Result<Option<StoredUser>, AuthError> {
    sqlx::query_as::<_, StoredUser>(
        "SELECT id, email, name, password_hash, subscription_tier, is_admin, subscription_start, subscription_end, created_at FROM users WHERE email = ?1",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
    .map_err(|e| AuthError::Storage(format!("failed to query user: {e}")))
}

pub(super) async fn find_user_by_id(
    pool: &SqlitePool,
    user_id: i64,
) -> Result<Option<StoredUser>, AuthError> {
    sqlx::query_as::<_, StoredUser>(
        "SELECT id, email, name, password_hash, subscription_tier, is_admin, subscription_start, subscription_end, created_at FROM users WHERE id = ?1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AuthError::Storage(format!("failed to query user: {e}")))
}

#[derive(Debug, sqlx::FromRow)]
pub(super) struct StoredRefreshToken {
    pub user_id: i64,
    pub expires_at: i64,
    pub revoked: i32,
}
