use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicU32;
use std::{net::IpAddr, sync::Arc, time::Duration};

use axum::http::StatusCode;
use bytes::Bytes;
use tokio::sync::{broadcast, mpsc, Mutex, Semaphore};
use tokio::time::Instant;

use crate::{auth::AuthState, log};

pub const BIND_ADDR: &str = "0.0.0.0:5151";
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10); // 10 seconds
pub const FREE_IDLE_TIMEOUT: Duration = Duration::from_mins(15); // 15 minutes
pub const PRO_SESSION_MAX_DURATION: Duration = Duration::from_hours(24); // 24 hours
pub const MAX_CONNECTIONS: usize = 128;

/// How long a shared session lasts for free users.
pub const FREE_SHARE_DURATION: Duration = Duration::from_mins(10); // 10 minutes
pub const SHARE_WS_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30); // keep idle share websockets alive

/// Broadcast channel capacity for each shared session.
pub const SHARE_BROADCAST_CAPACITY: usize = 256;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TunnelNode {
    pub name: String,
    #[serde(skip_serializing)]
    pub url: String,
    pub tier: String, // "free" or "pro"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip)]
    pub last_seen: Option<Instant>,
}

impl Default for TunnelNode {
    fn default() -> Self {
        TunnelNode {
            name: "mock1".to_string(),
            url: "http://localhost:8080".to_string(),
            tier: "free".to_string(),
            comment: None,
            last_seen: None,
        }
    }
}

/// Command that the owner can send to an individual watcher's loop.
pub enum WatcherCtrl {
    Kick,
    SetReadOnly(bool),
}

/// Serializable info about a connected watcher.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherInfo {
    pub id: u32,
    pub display_name: String,
    pub read_only: bool,
    #[serde(skip)]
    pub ctrl_tx: mpsc::Sender<WatcherCtrl>,
}

/// Arc'd map of currently connected watchers for a share session.
pub type WatcherMap = Arc<Mutex<HashMap<u32, WatcherInfo>>>;

/// An active terminal share session stored in the registry.
pub struct ShareEntry {
    /// User id of the owner (None if guest, though we require auth to create).
    pub owner_user_id: i64,
    /// When this share expires (None = never).
    pub expires_at: Option<Instant>,
    /// Sender half used by the publisher WS to broadcast terminal output.
    pub tx: broadcast::Sender<Bytes>,
    /// Sender half used by the watchers to send input back to the publisher.
    pub input_tx: broadcast::Sender<Bytes>,
    /// If true, the session default is read-only for watchers (no input forwarded).
    pub read_only: bool,
    /// Random token viewers must supply to access the watch WebSocket.
    pub watch_token: String,
    /// Broadcast channel for JSON presence/typing/room events (text messages).
    pub presence_tx: broadcast::Sender<String>,
    /// Monotonically increasing counter for assigning watcher IDs.
    pub watcher_counter: Arc<AtomicU32>,
    /// Currently connected watchers (id -> info + control channel).
    pub watchers: WatcherMap,
    /// Display names banned from this share (resets on room recreation).
    pub banned: HashSet<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub connection_limit: Arc<Semaphore>,
    pub allowed_origin: Option<Vec<String>>,
    pub auth: AuthState,
    pub tunnel_nodes: Arc<Mutex<Vec<TunnelNode>>>,
    pub tunnel_secret: String,
    /// per-user active connection counts (`user_id` -> active connections)
    pub user_connections: Arc<Mutex<HashMap<i64, usize>>>,
    /// active terminal share sessions (`share_code` -> `ShareEntry`)
    pub share_sessions: Arc<Mutex<HashMap<String, ShareEntry>>>,
}

#[derive(Debug, serde::Deserialize, Clone)]
pub struct WsQuery {
    pub host: String,
    pub port: u16,
    pub token: Option<String>,
    pub preferred_node: Option<String>,
}

impl Default for WsQuery {
    fn default() -> Self {
        WsQuery {
            host: "localhost".to_string(),
            port: 22,
            token: None,
            preferred_node: None,
        }
    }
}

pub fn validate_target(query: &WsQuery) -> Result<(), (StatusCode, &'static str)> {
    if query.host.is_empty() || query.host.len() > 255 {
        log::warn(&format!(
            "validate_target: invalid host length: '{}' (len={})",
            query.host,
            query.host.len()
        ));
        return Err((StatusCode::BAD_REQUEST, "invalid host"));
    }

    if query.port == 0 {
        log::warn(&format!(
            "validate_target: invalid port 0 for host={}",
            query.host
        ));
        return Err((StatusCode::BAD_REQUEST, "invalid port"));
    }

    if query.host.parse::<IpAddr>().is_ok() {
        return Ok(());
    }

    let valid_hostname = query
        .host
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'));

    if valid_hostname {
        log::info(&format!(
            "validate_target: accepted host={} port={}",
            query.host, query.port
        ));
        Ok(())
    } else {
        log::warn(&format!(
            "validate_target: invalid host characters: {}",
            query.host
        ));
        Err((StatusCode::BAD_REQUEST, "invalid host"))
    }
}
