use super::state::AuthState;
use crate::models::{AuthError, Comment};

impl AuthState {
    pub async fn add_comment(
        &self,
        news_id: i64,
        user_id: i64,
        content: String,
    ) -> Result<Comment, AuthError> {
        let now = super::state::unix_timestamp();
        let result = sqlx::query(
            "INSERT INTO comments (news_id, user_id, content, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(news_id)
        .bind(user_id)
        .bind(&content)
        .bind(now)
        .execute(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to insert comment: {e}")))?;

        let user_name = sqlx::query_scalar::<_, String>(
            "SELECT COALESCE(NULLIF(name, ''), email) FROM users WHERE id = ?1",
        )
        .bind(user_id)
        .fetch_one(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to get user name: {e}")))?;

        Ok(Comment {
            id: result.last_insert_rowid(),
            news_id,
            user_id,
            user_name,
            content,
            created_at: now,
        })
    }

    pub async fn get_comment(&self, comment_id: i64) -> Result<Comment, AuthError> {
        sqlx::query_as::<_, Comment>(
            "SELECT c.id, c.news_id, c.user_id, COALESCE(NULLIF(u.name, ''), u.email) as user_name, c.content, c.created_at
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.id = ?1",
        )
        .bind(comment_id)
        .fetch_optional(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query comment: {e}")))?
        .ok_or_else(|| AuthError::NotFound("comment not found".to_owned()))
    }

    pub async fn delete_comment(&self, comment_id: i64) -> Result<(), AuthError> {
        let result = sqlx::query("DELETE FROM comments WHERE id = ?1")
            .bind(comment_id)
            .execute(&self.database)
            .await
            .map_err(|e| AuthError::Storage(format!("failed to delete comment: {e}")))?;

        if result.rows_affected() == 0 {
            return Err(AuthError::NotFound("comment not found".to_owned()));
        }

        Ok(())
    }

    pub async fn update_comment(
        &self,
        comment_id: i64,
        new_content: String,
    ) -> Result<Comment, AuthError> {
        let result = sqlx::query("UPDATE comments SET content = ?1 WHERE id = ?2")
            .bind(&new_content)
            .bind(comment_id)
            .execute(&self.database)
            .await
            .map_err(|e| AuthError::Storage(format!("failed to update comment: {e}")))?;

        if result.rows_affected() == 0 {
            return Err(AuthError::NotFound("comment not found".to_owned()));
        }

        // Return the updated comment
        self.get_comment(comment_id).await
    }
}
