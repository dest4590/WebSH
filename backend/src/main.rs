mod auth;
mod config;
mod handlers;
mod log;
mod models;
mod router;
mod state;
mod tunnel;

use dotenvy::dotenv;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;

use crate::{config::Config, router::build_router, state::AppState};

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    if dotenv().is_ok() {
        log::info("loaded environment file: .env");
    }

    log::info(&format!("binding backend to {}", state::BIND_ADDR));

    let config =
        Config::load().unwrap_or_else(|error| panic!("failed to load backend config: {error}"));

    let auth = auth::AuthState::from_env()
        .await
        .unwrap_or_else(|error| panic!("failed to initialize auth state: {error}"));

    let app_state = AppState {
        connection_limit: Arc::new(Semaphore::new(state::MAX_CONNECTIONS)),
        allowed_origin: config.allowed_origin,
        auth,
        tunnel_nodes: Arc::new(tokio::sync::Mutex::new(config.tunnel_nodes)),
        tunnel_secret: config.tunnel_secret,
        user_connections: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
        share_sessions: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
    };

    let sessions = app_state.share_sessions.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_mins(1));
        loop {
            interval.tick().await;
            let now = tokio::time::Instant::now();
            let mut sessions_guard = sessions.lock().await;
            let initial_count = sessions_guard.len();
            sessions_guard.retain(|_, entry| entry.expires_at.is_none_or(|exp| exp > now));
            if sessions_guard.len() < initial_count {
                log::info(&format!(
                    "share-session sweep removed {} expired sessions",
                    initial_count - sessions_guard.len()
                ));
            }
        }
    });

    let app = build_router(app_state);

    let listener = tokio::net::TcpListener::bind(state::BIND_ADDR)
        .await
        .expect("failed to bind backend listener");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .unwrap_or_else(|e| log::error(&format!("axum server exited unexpectedly: {e}")));
}
