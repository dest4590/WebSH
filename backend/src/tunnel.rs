use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::{collections::HashMap, sync::Arc};
use tokio::{sync::OwnedSemaphorePermit, time::timeout};
use tokio_tungstenite::connect_async;

use crate::{
    auth::AuthUser,
    state::{CONNECT_TIMEOUT, FREE_IDLE_TIMEOUT, PRO_SESSION_MAX_DURATION, TunnelNode, WsQuery},
};

pub async fn handle_socket(
    socket: WebSocket,
    query: WsQuery,
    _permit: OwnedSemaphorePermit,
    user: Option<AuthUser>,
    node: TunnelNode,
    secret: String,
    user_connections: Option<std::sync::Arc<tokio::sync::Mutex<HashMap<i64, usize>>>>,
) {
    let user_label = user.as_ref().map_or("guest", |value| value.email.as_str());

    let tunnel_url = format!(
        "{}/tunnel?host={}&port={}&secret={}",
        node.url
            .replace("http://", "ws://")
            .replace("https://", "wss://"),
        query.host,
        query.port,
        secret
    );

    let Ok(Ok((tunnel_ws, _))) = timeout(CONNECT_TIMEOUT, connect_async(&tunnel_url)).await else {
        crate::log::warn(&format!(
            "failed to connect to tunnel node {} for user={}",
            node.url, user_label
        ));
        return;
    };

    crate::log::info(&format!(
        "relay established via node={} user={} host={} port={}",
        node.url, user_label, query.host, query.port
    ));

    let user_tier = user
        .as_ref()
        .map_or_else(|| "free".to_string(), |u| u.subscription_tier.clone());

    let idle_timeout = if user_tier == "free" {
        Some(FREE_IDLE_TIMEOUT)
    } else {
        None
    };
    let max_session_duration = if user_tier == "pro" {
        Some(PRO_SESSION_MAX_DURATION)
    } else {
        None
    };

    let (mut tunnel_write, mut tunnel_read) = tunnel_ws.split();
    let (mut ws_write, mut ws_read) = socket.split();

    let (close_tx, mut close_rx) = tokio::sync::mpsc::channel::<String>(1);
    let activity_notify = Arc::new(tokio::sync::Notify::new());

    if let Some(dt) = idle_timeout {
        let activity_notify = activity_notify.clone();
        let close_tx = close_tx.clone();
        tokio::spawn(async move {
            loop {
                let res = tokio::time::timeout(dt, activity_notify.notified()).await;
                if res.is_err() {
                    let _ = close_tx
                        .send("Idle timeout reached: free sessions disconnect after 15 minutes of inactivity.".to_string())
                        .await;
                    break;
                }
            }
        });
    }

    if let Some(md) = max_session_duration {
        let close_tx = close_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(md).await;
            let _ = close_tx
                .send("Session limit reached: Pro sessions persist for up to 24 hours.".to_string())
                .await;
        });
    }

    let mut close_reason: Option<String> = None;

    loop {
        tokio::select! {
            ws_msg = ws_read.next() => {
                match ws_msg {
                    Some(Ok(msg)) => {
                        if let Message::Binary(data) = msg {
                            if tunnel_write.send(tokio_tungstenite::tungstenite::Message::Binary(data)).await.is_err() {
                                break;
                            }
                            activity_notify.notify_one();
                        } else if let Message::Close(_) = msg {
                            break;
                        }
                    }
                    _ => break,
                }
            }
            tunnel_msg = tunnel_read.next() => {
                match tunnel_msg {
                    Some(Ok(msg)) => {
                        if let tokio_tungstenite::tungstenite::Message::Binary(data) = msg {
                            if ws_write.send(Message::Binary(data)).await.is_err() {
                                break;
                            }
                            activity_notify.notify_one();
                        }
                    }
                    _ => break,
                }
            }
            maybe_reason = close_rx.recv() => {
                if let Some(reason) = maybe_reason {
                    close_reason = Some(reason);
                }
                break;
            }
        }
    }

    if let Some(reason) = close_reason {
        let _ = ws_write
            .send(Message::Close(Some(CloseFrame {
                code: 1000u16,
                reason: reason.into(),
            })))
            .await;
    }

    let _ = ws_write.close().await;
    let _ = tunnel_write.close().await;

    if let Some(map) = user_connections {
        let uid = user.as_ref().map_or(0, |u| u.id);
        let mut guard = map.lock().await;
        let count = guard.get(&uid).copied().unwrap_or(1);
        if count <= 1 {
            guard.remove(&uid);
        } else {
            guard.insert(uid, count - 1);
        }
    }
}
