use super::state::AuthState;
use crate::models::AuthError;

impl AuthState {
    pub async fn get_sync_data(
        &self,
        user_id: i64,
        data_type: String,
    ) -> Result<Option<String>, AuthError> {
        sqlx::query_scalar::<_, String>(
            "SELECT encrypted_payload FROM sync_data WHERE user_id = ?1 AND data_type = ?2",
        )
        .bind(user_id)
        .bind(data_type)
        .fetch_optional(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query sync_data: {e}")))
    }

    pub async fn put_sync_data(
        &self,
        user_id: i64,
        data_type: String,
        encrypted_payload: String,
    ) -> Result<(), AuthError> {
        let now = super::state::unix_timestamp();
        sqlx::query(
            "INSERT INTO sync_data (user_id, data_type, encrypted_payload, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (user_id, data_type) DO UPDATE SET
                 encrypted_payload = excluded.encrypted_payload,
                 updated_at = excluded.updated_at",
        )
        .bind(user_id)
        .bind(data_type)
        .bind(encrypted_payload)
        .bind(now)
        .execute(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to upsert sync_data: {e}")))?;
        Ok(())
    }
}
