use axum::{
    Router,
    http::HeaderValue,
    routing::{delete, get, patch, post, put},
};
use std::sync::Arc;
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};
use tower_http::cors::{Any, CorsLayer};

use crate::{handlers, state::AppState};

pub fn build_router(app_state: AppState) -> Router {
    let cors = if let Some(origins) = app_state.allowed_origin.as_ref() {
        let allowed_origins = origins
            .iter()
            .filter_map(|origin| HeaderValue::from_str(origin).ok())
            .collect::<Vec<HeaderValue>>();

        CorsLayer::new()
            .allow_origin(allowed_origins)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    // Rate limiting: ~15 requests per second per IP, burst of 20
    // `per_second(15)` here means one token every 15 seconds, so use a sub-second period.
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .period(std::time::Duration::from_millis(66))
            .burst_size(20)
            .finish()
            .unwrap(),
    );

    let governor_limiter = governor_conf.limiter().clone();
    let interval = std::time::Duration::from_mins(1);
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(interval);
            governor_limiter.retain_recent();
        }
    });

    Router::new()
        .route("/", get(handlers::index_handler))
        .route("/ws", get(handlers::ws_handler))
        .route("/health", get(handlers::health_handler))
        .route("/nodes", get(handlers::list_nodes_handler))
        .route("/nodes/status", get(handlers::node_status_handler))
        .route("/nodes/heartbeat", post(handlers::heartbeat_handler))
        .route("/auth/register", post(handlers::register_handler))
        .route("/auth/login", post(handlers::login_handler))
        .route("/auth/refresh", post(handlers::refresh_handler))
        .route("/auth/me", get(handlers::me_handler))
        .route("/auth/me", put(handlers::update_me_handler))
        .route("/auth/admin/users", get(handlers::admin_list_users_handler))
        .route("/auth/admin/nodes", get(handlers::admin_list_nodes_handler))
        .route(
            "/auth/admin/users/{id}/subscription",
            put(handlers::admin_update_subscription_handler),
        )
        .route("/sync/{data_type}", get(handlers::get_sync_handler))
        .route("/sync/{data_type}", put(handlers::put_sync_handler))
        .route("/news", get(handlers::list_news_handler))
        .route("/news", post(handlers::create_news_handler))
        .route("/news/{id}", get(handlers::get_news_details_handler))
        .route("/news/{id}", put(handlers::edit_news_handler))
        .route("/news/{id}/comments", post(handlers::add_comment_handler))
        .route(
            "/news/{id}/comments/{comment_id}",
            delete(handlers::delete_comment_handler),
        )
        .route(
            "/news/{id}/comments/{comment_id}",
            put(handlers::update_comment_handler),
        )
        .route(
            "/news/{id}/reactions",
            post(handlers::toggle_reaction_handler),
        )
        .route("/share/create", post(handlers::create_share_handler))
        .route("/share/{code}", delete(handlers::revoke_share_handler))
        .route(
            "/share/{code}/publish",
            get(handlers::share_publish_handler),
        )
        .route("/share/{code}/watch", get(handlers::share_watch_handler))
        .route("/share/{code}/users", get(handlers::list_watchers_handler))
        .route(
            "/share/{code}/users/{id}/kick",
            post(handlers::kick_watcher_handler),
        )
        .route(
            "/share/{code}/users/{id}/ban",
            post(handlers::ban_watcher_handler),
        )
        .route(
            "/share/{code}/users/{id}",
            patch(handlers::set_watcher_readonly_handler),
        )
        .layer(GovernorLayer::new(governor_conf))
        .layer(cors)
        .with_state(app_state)
}
