use super::state::AuthState;
use crate::models::AuthError;

impl AuthState {
    pub async fn toggle_reaction(
        &self,
        news_id: i64,
        user_id: i64,
        reaction: String,
    ) -> Result<(), AuthError> {
        // validate reaction against allowed set to prevent clients faking reactions
        let reaction_enum = match crate::models::news::Reaction::try_from(reaction.as_str()) {
            Ok(r) => r,
            Err(_) => return Err(AuthError::Storage("invalid reaction".to_owned())),
        };

        let reaction_str = reaction_enum.to_string();

        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM reactions WHERE news_id = ?1 AND user_id = ?2 AND reaction = ?3)",
        )
        .bind(news_id)
        .bind(user_id)
        .bind(&reaction_str)
        .fetch_one(&self.database)
        .await
        .unwrap_or(false);

        if exists {
            sqlx::query(
                "DELETE FROM reactions WHERE news_id = ?1 AND user_id = ?2 AND reaction = ?3",
            )
            .bind(news_id)
            .bind(user_id)
            .bind(&reaction_str)
            .execute(&self.database)
            .await
            .map_err(|e| AuthError::Storage(format!("failed to delete reaction: {e}")))?;
        } else {
            sqlx::query("INSERT INTO reactions (news_id, user_id, reaction) VALUES (?1, ?2, ?3)")
                .bind(news_id)
                .bind(user_id)
                .bind(&reaction_str)
                .execute(&self.database)
                .await
                .map_err(|e| AuthError::Storage(format!("failed to insert reaction: {e}")))?;
        }

        Ok(())
    }
}
