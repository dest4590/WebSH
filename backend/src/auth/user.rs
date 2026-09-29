use jsonwebtoken::{Algorithm, Header, Validation, decode, encode};

use super::state::{
    AuthState, find_user_by_email, find_user_by_id, hash_password, normalize_email,
    validate_password, verify_password,
};
use crate::models::{AuthClaims, AuthError, AuthRequest, AuthResponse, AuthUser, StoredUser};

impl AuthState {
    pub async fn register(&self, payload: AuthRequest) -> Result<AuthResponse, AuthError> {
        let email = normalize_email(&payload.email)?;
        validate_password(&payload.password)?;
        let name = payload.name.unwrap_or_default();
        let password_hash = hash_password(&payload.password)?;
        let now = super::state::unix_timestamp();

        let existing = find_user_by_email(&self.database, &email).await?;
        if existing.is_some() {
            return Err(AuthError::DuplicateEmail);
        }

        let result = sqlx::query(
            "INSERT INTO users (email, name, password_hash, subscription_tier, is_admin, subscription_start, subscription_end, created_at) VALUES (?1, ?2, ?3, 'free', 0, NULL, NULL, ?4)",
        )
        .bind(&email)
        .bind(&name)
        .bind(&password_hash)
        .bind(now)
        .execute(&self.database)
        .await
        .map_err(|error| AuthError::Storage(format!("failed to insert user: {error}")))?;

        let stored_user = StoredUser {
            id: result.last_insert_rowid(),
            email,
            name,
            password_hash,
            subscription_tier: "free".to_owned(),
            subscription_start: None,
            subscription_end: None,
            is_admin: 0,
            created_at: now,
        };

        let refresh_token = self.create_refresh_token(stored_user.id).await?;
        self.issue_auth_response(stored_user, refresh_token)
    }

    pub async fn login(&self, payload: AuthRequest) -> Result<AuthResponse, AuthError> {
        let email = normalize_email(&payload.email)?;
        let password = payload.password;

        let stored_user = find_user_by_email(&self.database, &email)
            .await?
            .ok_or(AuthError::InvalidCredentials)?;

        verify_password(&password, &stored_user.password_hash)?;
        let refresh_token = self.create_refresh_token(stored_user.id).await?;
        self.issue_auth_response(stored_user, refresh_token)
    }

    pub async fn refresh(&self, refresh_token: &str) -> Result<AuthResponse, AuthError> {
        let refresh_record = self.authenticate_refresh_token(refresh_token).await?;
        let stored_user = find_user_by_id(&self.database, refresh_record.user_id)
            .await?
            .ok_or(AuthError::InvalidToken)?;

        self.invalidate_refresh_token(refresh_token).await?;
        let new_refresh_token = self.create_refresh_token(stored_user.id).await?;
        self.issue_auth_response(stored_user, new_refresh_token)
    }

    pub async fn authenticate_token(&self, token: &str) -> Result<AuthUser, AuthError> {
        let claims = decode::<AuthClaims>(
            token,
            &self.decoding_key,
            &Validation::new(Algorithm::HS256),
        )
        .map(|data| data.claims)
        .map_err(|_| AuthError::InvalidToken)?;

        find_user_by_id(&self.database, claims.sub)
            .await?
            .map(Into::into)
            .ok_or(AuthError::InvalidToken)
    }

    fn issue_auth_response(
        &self,
        stored_user: StoredUser,
        refresh_token: String,
    ) -> Result<AuthResponse, AuthError> {
        let now = super::state::unix_timestamp();
        let issued_at = now.max(0) as u64;
        let claims = AuthClaims {
            sub: stored_user.id,
            email: stored_user.email.clone(),
            tier: stored_user.subscription_tier.clone(),
            admin: stored_user.is_admin != 0,
            iat: issued_at,
            exp: issued_at + self.jwt_ttl.as_secs(),
        };

        let token = encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|error| AuthError::Storage(format!("failed to encode jwt: {error}")))?;

        Ok(AuthResponse {
            token,
            refresh_token,
            user: stored_user.into(),
        })
    }

    pub async fn list_users(&self) -> Result<Vec<AuthUser>, AuthError> {
        let users = sqlx::query_as::<_, StoredUser>(
            "SELECT id, email, name, password_hash, subscription_tier, is_admin, subscription_start, subscription_end, created_at FROM users ORDER BY id DESC",
        )
        .fetch_all(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query users: {e}")))?;

        Ok(users.into_iter().map(Into::into).collect())
    }

    pub async fn update_subscription(
        &self,
        user_id: i64,
        tier: String,
        start: Option<i64>,
        end: Option<i64>,
        is_admin: Option<bool>,
    ) -> Result<AuthUser, AuthError> {
        let admin_val = is_admin.map(i32::from);

        sqlx::query(
            "UPDATE users SET subscription_tier = ?1, subscription_start = ?2, subscription_end = ?3, is_admin = COALESCE(?4, is_admin) WHERE id = ?5",
        )
        .bind(&tier)
        .bind(start)
        .bind(end)
        .bind(admin_val)
        .bind(user_id)
        .execute(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to update user: {e}")))?;

        find_user_by_id(&self.database, user_id)
            .await?
            .map(Into::into)
            .ok_or(AuthError::Storage("user not found after update".to_owned()))
    }

    pub async fn update_name(&self, user_id: i64, name: String) -> Result<AuthUser, AuthError> {
        sqlx::query("UPDATE users SET name = ?1 WHERE id = ?2")
            .bind(&name)
            .bind(user_id)
            .execute(&self.database)
            .await
            .map_err(|e| AuthError::Storage(format!("failed to update user name: {e}")))?;

        find_user_by_id(&self.database, user_id)
            .await?
            .map(Into::into)
            .ok_or(AuthError::Storage("user not found after update".to_owned()))
    }
}
