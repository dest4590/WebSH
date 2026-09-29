use axum::{
    Json,
    extract::{Path, Query, State, ws::Message, ws::WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::{
    Arc,
    atomic::{AtomicU32, Ordering},
};
use tokio::sync::{broadcast, mpsc};

use crate::{
    auth::extract_bearer_token,
    state::{
        AppState, FREE_SHARE_DURATION, SHARE_BROADCAST_CAPACITY, SHARE_WS_HEARTBEAT_INTERVAL,
        ShareEntry, WatcherCtrl, WatcherInfo, WatcherMap,
    },
};

// ---------------------------------------------------------------------------
// POST /share/create
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareRequest {
    /// When true viewers get a read-only session (no keyboard forwarding).
    #[serde(default = "default_read_only")]
    pub read_only: bool,
}

fn default_read_only() -> bool {
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareResponse {
    pub code: String,
    /// Seconds until expiry.  None means it never expires (pro).
    pub expires_in_secs: Option<u64>,
    pub read_only: bool,
    /// Opaque token viewers must include as `?token=` when connecting.
    pub watch_token: String,
}

/// Authenticated users call this to create a new share slot.
pub async fn create_share_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::Json(body): axum::Json<CreateShareRequest>,
) -> Result<Json<CreateShareResponse>, (StatusCode, Json<serde_json::Value>)> {
    let err = |msg: &str| {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": msg })),
        )
    };

    let token = extract_bearer_token(&headers).ok_or_else(|| err("authentication required"))?;

    let user = state
        .auth
        .authenticate_token(token)
        .await
        .map_err(|_| err("invalid token"))?;

    let is_pro = user.subscription_tier == "pro";

    let expires_at = if is_pro {
        None
    } else {
        Some(tokio::time::Instant::now() + FREE_SHARE_DURATION)
    };

    // Generate a random share code (16 hex chars = 64-bit entropy).
    let code = generate_code();

    let (tx, _) = broadcast::channel::<Bytes>(SHARE_BROADCAST_CAPACITY);
    let (input_tx, _) = broadcast::channel::<Bytes>(SHARE_BROADCAST_CAPACITY);
    let (presence_tx, _) = broadcast::channel::<String>(SHARE_BROADCAST_CAPACITY);

    // Generate a separate watch token (16 hex chars = 64-bit entropy).
    let watch_token = generate_code();

    {
        let mut sessions = state.share_sessions.lock().await;
        // Garbage-collect expired sessions while we have the lock.
        let now = tokio::time::Instant::now();
        sessions.retain(|_, entry| entry.expires_at.is_none_or(|exp| exp > now));

        sessions.insert(
            code.clone(),
            ShareEntry {
                owner_user_id: user.id,
                expires_at,
                tx,
                input_tx,
                read_only: body.read_only,
                watch_token: watch_token.clone(),
                presence_tx,
                watcher_counter: Arc::new(AtomicU32::new(0)),
                watchers: Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new())),
                banned: std::collections::HashSet::new(),
            },
        );
    }

    let expires_in_secs = if is_pro {
        None
    } else {
        Some(FREE_SHARE_DURATION.as_secs())
    };

    crate::log::info(&format!(
        "share created: code={} user={} expires_in={:?} read_only={}",
        code, user.email, expires_in_secs, body.read_only
    ));

    Ok(Json(CreateShareResponse {
        code,
        expires_in_secs,
        read_only: body.read_only,
        watch_token,
    }))
}

// ---------------------------------------------------------------------------
// DELETE /share/:code
// ---------------------------------------------------------------------------

/// Authenticated owner can revoke a share early.
pub async fn revoke_share_handler(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let err = |msg: &str| {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": msg })),
        )
    };

    let token = extract_bearer_token(&headers).ok_or_else(|| err("authentication required"))?;
    let user = state
        .auth
        .authenticate_token(token)
        .await
        .map_err(|_| err("invalid token"))?;

    let mut sessions = state.share_sessions.lock().await;
    if let Some(entry) = sessions.get(&code) {
        if entry.owner_user_id != user.id {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "not your share" })),
            ));
        }
        sessions.remove(&code);
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /share/:code/publish  (WebSocket owner publishes terminal output)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PublishQuery {
    pub token: Option<String>,
}

pub async fn share_publish_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(code): Path<String>,
    Query(query): Query<PublishQuery>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, &'static str)> {
    let raw_token = query
        .token
        .as_deref()
        .or_else(|| extract_bearer_token(&headers))
        .ok_or((StatusCode::UNAUTHORIZED, "authentication required"))?;

    let user = state
        .auth
        .authenticate_token(raw_token)
        .await
        .map_err(|_| (StatusCode::UNAUTHORIZED, "invalid token"))?;

    // Locate the share entry and verify ownership.
    let (tx, mut input_rx, presence_tx, mut presence_rx) = {
        let sessions = state.share_sessions.lock().await;
        let entry = sessions
            .get(&code)
            .ok_or((StatusCode::NOT_FOUND, "share not found"))?;

        if entry.owner_user_id != user.id {
            return Err((StatusCode::FORBIDDEN, "not your share"));
        }

        if entry
            .expires_at
            .is_some_and(|exp| exp <= tokio::time::Instant::now())
        {
            return Err((StatusCode::GONE, "share expired"));
        }

        (
            entry.tx.clone(),
            entry.input_tx.subscribe(),
            entry.presence_tx.clone(),
            entry.presence_tx.subscribe(),
        )
    };

    let code_clone = code.clone();
    Ok(ws.on_upgrade(move |socket| async move {
        crate::log::info(&format!(
            "share publish ws connected: code={} user={}",
            code_clone, user.email
        ));

        let (mut ws_write, mut ws_read) = socket.split();
        let mut heartbeat = tokio::time::interval(SHARE_WS_HEARTBEAT_INTERVAL);
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if ws_write.send(Message::Ping(Bytes::new())).await.is_err() {
                        break;
                    }
                }
                result = input_rx.recv() => {
                    match result {
                        Ok(data) => {
                            if ws_write.send(Message::Binary(data)).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                        Err(broadcast::error::RecvError::Lagged(_)) => {}
                    }
                }
                // Forward viewer typing indicators to the publisher as text frames.
                result = presence_rx.recv() => {
                    match result {
                        Ok(json) => {
                            if ws_write.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                        Err(broadcast::error::RecvError::Lagged(_)) => {}
                    }
                }
                msg = ws_read.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            // Broadcast terminal output to all watchers.
                            let _ = tx.send(data);
                        }
                        Some(Ok(Message::Text(text))) => {
                                // Owner sent a text frame (typing/presence event) – broadcast to watchers.
                                let _ = presence_tx.send(text.to_string());
                        }
                        Some(Ok(Message::Ping(payload))) => {
                            if ws_write.send(Message::Pong(payload)).await.is_err() {
                                break;
                            }
                        }
                        Some(Ok(Message::Pong(_))) => {}
                        Some(Ok(Message::Close(_))) | None => break,
                        Some(Err(_)) => break,
                    }
                }
            }
        }

        crate::log::info(&format!("share publish ws closed: code={code_clone}"));
    }))
}

// ---------------------------------------------------------------------------
// GET /share/:code/watch  (WebSocket  viewers subscribe)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct WatchQuery {
    /// Watch token from the share URL  required.
    pub token: String,
    /// Optional display name shown in typing indicators.
    pub display_name: Option<String>,
}

pub async fn share_watch_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(code): Path<String>,
    Query(query): Query<WatchQuery>,
) -> Result<impl IntoResponse, (StatusCode, &'static str)> {
    let display_name_raw = query.display_name.filter(|n| !n.is_empty());

    let (rx, input_tx, presence_tx, watchers, watcher_id, read_only) = {
        let sessions = state.share_sessions.lock().await;
        let entry = sessions
            .get(&code)
            .ok_or((StatusCode::NOT_FOUND, "share not found"))?;

        if entry.watch_token != query.token {
            return Err((StatusCode::UNAUTHORIZED, "invalid watch token"));
        }

        if entry
            .expires_at
            .is_some_and(|exp| exp <= tokio::time::Instant::now())
        {
            return Err((StatusCode::GONE, "share expired"));
        }

        let id = entry.watcher_counter.fetch_add(1, Ordering::Relaxed) + 1;
        let display_name_check = display_name_raw
            .clone()
            .unwrap_or_else(|| format!("User {id}"));
        if entry.banned.contains(&display_name_check) {
            return Err((StatusCode::FORBIDDEN, "banned from this share"));
        }

        (
            entry.tx.subscribe(),
            entry.input_tx.clone(),
            entry.presence_tx.clone(),
            Arc::clone(&entry.watchers),
            id,
            entry.read_only,
        )
    };

    let display_name = display_name_raw.unwrap_or_else(|| format!("User {watcher_id}"));
    let (ctrl_tx, ctrl_rx) = mpsc::channel::<WatcherCtrl>(16);

    let code_clone = code.clone();
    Ok(ws.on_upgrade(move |socket| {
        handle_watcher(
            socket,
            rx,
            input_tx,
            presence_tx,
            watchers,
            code_clone,
            display_name,
            read_only,
            watcher_id,
            ctrl_tx,
            ctrl_rx,
        )
    }))
}

async fn handle_watcher(
    socket: axum::extract::ws::WebSocket,
    mut rx: broadcast::Receiver<Bytes>,
    input_tx: broadcast::Sender<Bytes>,
    presence_tx: broadcast::Sender<String>,
    watchers: WatcherMap,
    code: String,
    display_name: String,
    session_read_only: bool,
    watcher_id: u32,
    ctrl_tx: mpsc::Sender<WatcherCtrl>,
    mut ctrl_rx: mpsc::Receiver<WatcherCtrl>,
) {
    {
        let mut wmap = watchers.lock().await;
        wmap.insert(
            watcher_id,
            WatcherInfo {
                id: watcher_id,
                display_name: display_name.clone(),
                read_only: session_read_only,
                ctrl_tx,
            },
        );
    }
    push_room_update(&watchers, &presence_tx).await;

    crate::log::info(&format!(
        "share watch ws connected: code={code} display_name={display_name} read_only={session_read_only}"
    ));

    let mut effective_read_only = session_read_only;
    let (mut ws_write, mut ws_read) = socket.split();
    let mut presence_rx = presence_tx.subscribe();
    let mut heartbeat = tokio::time::interval(SHARE_WS_HEARTBEAT_INTERVAL);

    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                if ws_write.send(Message::Ping(Bytes::new())).await.is_err() {
                    break;
                }
            }
            result = rx.recv() => {
                match result {
                    Ok(data) => {
                        if ws_write.send(Message::Binary(data)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        let _ = ws_write.send(Message::Close(None)).await;
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                }
            }
            result = presence_rx.recv() => {
                match result {
                    Ok(json) => {
                        if ws_write.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                }
            }
            ctrl = ctrl_rx.recv() => {
                match ctrl {
                    Some(WatcherCtrl::Kick) => {
                        let _ = ws_write
                            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                                code: 4003,
                                reason: "kicked by owner".into(),
                            })))
                            .await;
                        break;
                    }
                    Some(WatcherCtrl::SetReadOnly(ro)) => {
                        effective_read_only = ro;
                        // Notify watcher of permission change.
                        let notif = serde_json::json!({
                            "type": "permission_update",
                            "readOnly": ro,
                        });
                        if ws_write.send(Message::Text(notif.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) if !effective_read_only => {
                        let _ = input_tx.send(data);
                    }
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&text)
                            && val.get("type").and_then(|t| t.as_str()) == Some("typing") {
                                val["from"] = serde_json::Value::String(display_name.clone());
                                let _ = presence_tx.send(val.to_string());
                            }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if ws_write.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                }
            }
        }
    }

    {
        let mut wmap = watchers.lock().await;
        wmap.remove(&watcher_id);
    }

    push_room_update(&watchers, &presence_tx).await;

    crate::log::info(&format!("share watch ws closed: code={code}"));
}

// ---------------------------------------------------------------------------
// GET /share/:code/users  (list connected watchers  owner only)
// ---------------------------------------------------------------------------

pub async fn list_watchers_handler(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let owner_err = |msg: &str| {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": msg })),
        )
    };

    let token =
        extract_bearer_token(&headers).ok_or_else(|| owner_err("authentication required"))?;
    let user = state
        .auth
        .authenticate_token(token)
        .await
        .map_err(|_| owner_err("invalid token"))?;

    let (watchers, banned) = {
        let sessions = state.share_sessions.lock().await;
        let entry = sessions.get(&code).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "share not found" })),
            )
        })?;
        if entry.owner_user_id != user.id {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "not your share" })),
            ));
        }
        (
            Arc::clone(&entry.watchers),
            entry.banned.iter().cloned().collect::<Vec<_>>(),
        )
    };

    let wmap = watchers.lock().await;
    let users: Vec<&WatcherInfo> = wmap.values().collect();
    Ok(Json(
        serde_json::json!({ "users": users, "banned": banned }),
    ))
}

// ---------------------------------------------------------------------------
// POST /share/:code/users/:id/kick  (owner kicks a watcher)
// ---------------------------------------------------------------------------

pub async fn kick_watcher_handler(
    State(state): State<AppState>,
    Path((code, watcher_id)): Path<(String, u32)>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    watcher_ctrl_action(
        &state,
        &code,
        watcher_id,
        &headers,
        |_| {},
        WatcherCtrl::Kick,
    )
    .await
}

// ---------------------------------------------------------------------------
// POST /share/:code/users/:id/ban  (owner bans + kicks a watcher)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /share/:code/users/:id/ban  (owner bans + kicks a watcher)
// ---------------------------------------------------------------------------

pub async fn ban_watcher_handler(
    State(state): State<AppState>,
    Path((code, watcher_id)): Path<(String, u32)>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let err = |status: StatusCode, msg: &str| (status, Json(serde_json::json!({ "error": msg })));

    let token = extract_bearer_token(&headers)
        .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "authentication required"))?;
    let user = state
        .auth
        .authenticate_token(token)
        .await
        .map_err(|_| err(StatusCode::UNAUTHORIZED, "invalid token"))?;

    let (ctrl_tx, display_name, watchers, presence_tx) = {
        let sessions = state.share_sessions.lock().await;
        let entry = sessions
            .get(&code)
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "share not found"))?;
        if entry.owner_user_id != user.id {
            return Err(err(StatusCode::FORBIDDEN, "not your share"));
        }
        let wmap = entry
            .watchers
            .try_lock()
            .map_err(|_| err(StatusCode::CONFLICT, "try again"))?;
        let info = wmap
            .get(&watcher_id)
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "watcher not found"))?;
        (
            info.ctrl_tx.clone(),
            info.display_name.clone(),
            Arc::clone(&entry.watchers),
            entry.presence_tx.clone(),
        )
    };

    // Add to banned set.
    {
        let mut sessions = state.share_sessions.lock().await;
        if let Some(entry) = sessions.get_mut(&code) {
            entry.banned.insert(display_name);
        }
    }

    // Kick the watcher.
    let _ = ctrl_tx.send(WatcherCtrl::Kick).await;
    push_room_update(&watchers, &presence_tx).await;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// PATCH /share/:code/users/:id  (owner toggles read-only for a watcher)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetReadOnlyBody {
    pub read_only: bool,
}

pub async fn set_watcher_readonly_handler(
    State(state): State<AppState>,
    Path((code, watcher_id)): Path<(String, u32)>,
    headers: HeaderMap,
    Json(body): Json<SetReadOnlyBody>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let err = |status: StatusCode, msg: &str| (status, Json(serde_json::json!({ "error": msg })));

    let token = extract_bearer_token(&headers)
        .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "authentication required"))?;
    let user = state
        .auth
        .authenticate_token(token)
        .await
        .map_err(|_| err(StatusCode::UNAUTHORIZED, "invalid token"))?;

    let (ctrl_tx, watchers, presence_tx) = {
        let sessions = state.share_sessions.lock().await;
        let entry = sessions
            .get(&code)
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "share not found"))?;
        if entry.owner_user_id != user.id {
            return Err(err(StatusCode::FORBIDDEN, "not your share"));
        }
        let wmap = entry
            .watchers
            .try_lock()
            .map_err(|_| err(StatusCode::CONFLICT, "try again"))?;
        let info = wmap
            .get(&watcher_id)
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "watcher not found"))?;
        (
            info.ctrl_tx.clone(),
            Arc::clone(&entry.watchers),
            entry.presence_tx.clone(),
        )
    };

    // Update the stored read_only flag.
    {
        let mut wmap = watchers.lock().await;
        if let Some(info) = wmap.get_mut(&watcher_id) {
            info.read_only = body.read_only;
        }
    }

    // Notify the watcher's loop.
    let _ = ctrl_tx.send(WatcherCtrl::SetReadOnly(body.read_only)).await;

    // Broadcast updated user list to publisher.
    push_room_update(&watchers, &presence_tx).await;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Validate owner auth, find watcher `ctrl_tx`, apply side-effect, send ctrl msg.
async fn watcher_ctrl_action<F>(
    state: &AppState,
    code: &str,
    watcher_id: u32,
    headers: &HeaderMap,
    _side_effect: F,
    ctrl: WatcherCtrl,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)>
where
    F: FnOnce(&mut ShareEntry),
{
    let err = |status: StatusCode, msg: &str| (status, Json(serde_json::json!({ "error": msg })));

    let token = extract_bearer_token(headers)
        .ok_or_else(|| err(StatusCode::UNAUTHORIZED, "authentication required"))?;
    let user = state
        .auth
        .authenticate_token(token)
        .await
        .map_err(|_| err(StatusCode::UNAUTHORIZED, "invalid token"))?;

    let (ctrl_tx, watchers, presence_tx) = {
        let sessions = state.share_sessions.lock().await;
        let entry = sessions
            .get(code)
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "share not found"))?;
        if entry.owner_user_id != user.id {
            return Err(err(StatusCode::FORBIDDEN, "not your share"));
        }
        let wmap = entry
            .watchers
            .try_lock()
            .map_err(|_| err(StatusCode::CONFLICT, "try again"))?;
        let info = wmap
            .get(&watcher_id)
            .ok_or_else(|| err(StatusCode::NOT_FOUND, "watcher not found"))?;
        (
            info.ctrl_tx.clone(),
            Arc::clone(&entry.watchers),
            entry.presence_tx.clone(),
        )
    };

    let _ = ctrl_tx.send(ctrl).await;
    push_room_update(&watchers, &presence_tx).await;

    Ok(StatusCode::NO_CONTENT)
}

async fn push_room_update(watchers: &WatcherMap, presence_tx: &broadcast::Sender<String>) {
    let wmap = watchers.lock().await;
    let users: Vec<serde_json::Value> = wmap
        .values()
        .map(|w| {
            serde_json::json!({
                "id": w.id,
                "displayName": w.display_name,
                "readOnly": w.read_only,
            })
        })
        .collect();
    drop(wmap);
    let msg = serde_json::json!({ "type": "room_update", "users": users });
    let _ = presence_tx.send(msg.to_string());
}

fn generate_code() -> String {
    use std::fmt::Write;
    let mut buf = String::with_capacity(16);
    for byte in rand_bytes() {
        write!(&mut buf, "{byte:02x}").unwrap();
    }
    buf
}

fn rand_bytes() -> [u8; 8] {
    let mut bytes = [0u8; 8];
    getrandom::fill(&mut bytes).expect("getrandom failed");
    bytes
}
