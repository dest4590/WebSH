use sqlx::Row;

use super::state::AuthState;
use crate::models::{AuthError, Comment, NewsItem, NewsWithDetails, ReactionCount};

impl AuthState {
    pub async fn create_news(
        &self,
        author_id: i64,
        title: String,
        content: String,
    ) -> Result<NewsItem, AuthError> {
        let now = super::state::unix_timestamp();
        let result = sqlx::query(
            "INSERT INTO news (title, content, author_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&title)
        .bind(&content)
        .bind(author_id)
        .bind(now)
        .execute(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to insert news: {e}")))?;

        Ok(NewsItem {
            id: result.last_insert_rowid(),
            title,
            content,
            author_id,
            created_at: now,
        })
    }

    pub async fn list_news(&self) -> Result<Vec<NewsItem>, AuthError> {
        sqlx::query_as::<_, NewsItem>(
            "SELECT id, title, content, author_id, created_at FROM news ORDER BY created_at DESC",
        )
        .fetch_all(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query news: {e}")))
    }

    pub async fn get_news_details(
        &self,
        news_id: i64,
        current_user_id: Option<i64>,
    ) -> Result<NewsWithDetails, AuthError> {
        let news = sqlx::query_as::<_, NewsItem>(
            "SELECT id, title, content, author_id, created_at FROM news WHERE id = ?1",
        )
        .bind(news_id)
        .fetch_optional(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query news: {e}")))?
        .ok_or(AuthError::Storage("news not found".to_owned()))?;

        let comments = sqlx::query_as::<_, Comment>(
            "SELECT c.id, c.news_id, c.user_id, COALESCE(NULLIF(u.name, ''), u.email) as user_name, c.content, c.created_at 
             FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.news_id = ?1 
             ORDER BY c.created_at ASC",
        )
        .bind(news_id)
        .fetch_all(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query comments: {e}")))?;

        let reactions_rows = sqlx::query(
            "SELECT reaction, COUNT(*) as count, MAX(CASE WHEN user_id = ?1 THEN 1 ELSE 0 END) as me
             FROM reactions 
             WHERE news_id = ?2 
             GROUP BY reaction",
        )
        .bind(current_user_id.unwrap_or(-1))
        .bind(news_id)
        .fetch_all(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to query reactions: {e}")))?;

        let reactions = reactions_rows
            .into_iter()
            .map(|row| ReactionCount {
                reaction: row.get("reaction"),
                count: row.get("count"),
                me: row.get::<i32, _>("me") != 0,
            })
            .collect();

        Ok(NewsWithDetails {
            news,
            comments,
            reactions,
        })
    }

    pub async fn update_news(
        &self,
        news_id: i64,
        title: String,
        content: String,
    ) -> Result<NewsItem, AuthError> {
        let result = sqlx::query("UPDATE news SET title = ?1, content = ?2 WHERE id = ?3")
            .bind(&title)
            .bind(&content)
            .bind(news_id)
            .execute(&self.database)
            .await
            .map_err(|e| AuthError::Storage(format!("failed to update news: {e}")))?;

        if result.rows_affected() == 0 {
            return Err(AuthError::NotFound("news not found".to_owned()));
        }

        sqlx::query_as::<_, NewsItem>(
            "SELECT id, title, content, author_id, created_at FROM news WHERE id = ?1",
        )
        .bind(news_id)
        .fetch_one(&self.database)
        .await
        .map_err(|e| AuthError::Storage(format!("failed to fetch updated news: {e}")))
    }
}
