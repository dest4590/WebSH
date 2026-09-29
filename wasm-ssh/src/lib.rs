use std::{
    collections::VecDeque,
    io,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll, Waker},
};

use russh::{
    ChannelMsg, Pty,
    client::{self, Handle},
    keys::{PrivateKeyWithHashAlg, PublicKey, decode_secret_key},
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
use web_sys::console;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum AuthMethod {
    Password {
        password: String,
    },
    PrivateKey {
        #[serde(rename = "privateKeyPem")]
        private_key_pem: String,
        passphrase: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Credentials {
    username: String,
    term: Option<String>,
    cols: u32,
    rows: u32,
    auth_method: AuthMethod,
    expected_host_key: Option<String>,
}

#[derive(Default)]
struct ChannelState {
    inbound: VecDeque<u8>,
    outbound: Vec<u8>,
    read_waker: Option<Waker>,
    write_waker: Option<Waker>,
    closed: bool,
}

#[derive(Clone, Default)]
struct SharedChannel(Arc<Mutex<ChannelState>>);

impl SharedChannel {
    fn push_inbound(&self, data: &[u8]) {
        let mut state = self.0.lock().unwrap();
        state.inbound.extend(data);
        if let Some(waker) = state.read_waker.take() {
            waker.wake();
        }
    }

    fn drain_outbound(&self) -> Vec<u8> {
        let mut state = self.0.lock().unwrap();
        std::mem::take(&mut state.outbound)
    }

    fn close(&self) {
        let mut state = self.0.lock().unwrap();
        state.closed = true;
        if let Some(waker) = state.read_waker.take() {
            waker.wake();
        }
        if let Some(waker) = state.write_waker.take() {
            waker.wake();
        }
    }
}

struct WsChannel(SharedChannel);

impl tokio::io::AsyncRead for WsChannel {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let mut state = self.0.0.lock().unwrap();
        if state.inbound.is_empty() {
            if state.closed {
                return Poll::Ready(Ok(()));
            }
            state.read_waker = Some(cx.waker().clone());
            return Poll::Pending;
        }
        let n = buf.remaining().min(state.inbound.len());
        let data: Vec<u8> = state.inbound.drain(..n).collect();
        buf.put_slice(&data);
        Poll::Ready(Ok(()))
    }
}

impl tokio::io::AsyncWrite for WsChannel {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let mut state = self.0.0.lock().unwrap();
        state.outbound.extend_from_slice(buf);
        if let Some(waker) = state.write_waker.take() {
            waker.wake();
        }
        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.0.close();
        Poll::Ready(Ok(()))
    }
}

struct ClientHandler {
    expected_host_key: Option<String>,
    server_host_key: Arc<Mutex<Option<String>>>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let actual_key = server_public_key.to_string();
        *self.server_host_key.lock().unwrap() = Some(actual_key.clone());

        if let Some(expected) = &self.expected_host_key {
            let matches = expected == &actual_key;
            log_info(format!(
                "[wasm-ssh] server host key received; expected key provided, match={matches}"
            ));
            if !matches {
                log_error(format!(
                    "[wasm-ssh] server host key mismatch\nexpected: {expected}\nactual: {actual_key}"
                ));
            }
            return Ok(matches);
        }

        log_info(format!(
            "[wasm-ssh] server host key received; no expected key configured\nactual: {actual_key}"
        ));
        Ok(true)
    }
}

use tokio::sync::mpsc;

enum SessionCommand {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
}

fn log_info(message: impl AsRef<str>) {
    console::log_1(&JsValue::from_str(message.as_ref()));
}

fn log_error(message: impl AsRef<str>) {
    console::error_1(&JsValue::from_str(message.as_ref()));
}

fn js_error(stage: &str, error: impl std::fmt::Display) -> JsValue {
    let message = format!("{stage}: {error}");
    log_error(&message);
    JsValue::from_str(&message)
}

fn auth_method_name(auth_method: &AuthMethod) -> &'static str {
    match auth_method {
        AuthMethod::Password { .. } => "password",
        AuthMethod::PrivateKey { .. } => "private key",
    }
}

#[wasm_bindgen]
pub struct WasmSshSession {
    creds: Credentials,
    transport: SharedChannel,
    output: SharedChannel,
    cmd_tx: Arc<Mutex<Option<mpsc::UnboundedSender<SessionCommand>>>>,
    handle: Arc<Mutex<Option<Handle<ClientHandler>>>>,
    server_host_key: Arc<Mutex<Option<String>>>,
}

#[wasm_bindgen]
impl WasmSshSession {
    #[wasm_bindgen(constructor)]
    pub fn new(credentials: JsValue) -> Result<WasmSshSession, JsValue> {
        let creds: Credentials = serde_wasm_bindgen::from_value(credentials)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        log_info(format!(
            "[wasm-ssh] session created for {} using {} auth, terminal {}x{}",
            creds.username,
            auth_method_name(&creds.auth_method),
            creds.cols.max(1),
            creds.rows.max(1)
        ));

        Ok(WasmSshSession {
            creds,
            transport: SharedChannel::default(),
            output: SharedChannel::default(),
            cmd_tx: Arc::new(Mutex::new(None)),
            handle: Arc::new(Mutex::new(None)),
            server_host_key: Arc::new(Mutex::new(None)),
        })
    }

    #[wasm_bindgen(js_name = getServerHostKey)]
    pub fn get_server_host_key(&self) -> Option<String> {
        self.server_host_key.lock().unwrap().clone()
    }

    #[wasm_bindgen(js_name = connect)]
    pub async fn connect(&self) -> Result<(), JsValue> {
        log_info(format!(
            "[wasm-ssh] connect start\nusername: {}\nterminal: {}x{}\nauth: {}\nhost key expected: {}",
            self.creds.username,
            self.creds.cols.max(1),
            self.creds.rows.max(1),
            auth_method_name(&self.creds.auth_method),
            self.creds.expected_host_key.is_some()
        ));

        let channel_io = WsChannel(self.transport.clone());
        let config = std::sync::Arc::new(client::Config::default());

        log_info("[wasm-ssh] starting SSH transport handshake");

        let handle = client::connect_stream(
            config,
            channel_io,
            ClientHandler {
                expected_host_key: self.creds.expected_host_key.clone(),
                server_host_key: self.server_host_key.clone(),
            },
        )
        .await
        .map_err(|e| js_error("SSH transport handshake failed", e))?;

        let mut handle = handle;

        log_info("[wasm-ssh] transport handshake complete, starting authentication");

        authenticate(&mut handle, &self.creds)
            .await
            .map_err(|e| js_error("SSH authentication failed", e))?;

        log_info("[wasm-ssh] authentication succeeded, opening session channel");

        let mut channel = handle
            .channel_open_session()
            .await
            .map_err(|e| js_error("Opening SSH session channel failed", e))?;

        let term = self.creds.term.as_deref().unwrap_or("xterm-256color");
        log_info(format!(
            "[wasm-ssh] requesting pty term={term} cols={} rows={}",
            self.creds.cols.max(1),
            self.creds.rows.max(1)
        ));
        channel
            .request_pty(
                true,
                term,
                self.creds.cols.max(1),
                self.creds.rows.max(1),
                0,
                0,
                &[(Pty::TTY_OP_ISPEED, 14_400), (Pty::TTY_OP_OSPEED, 14_400)],
            )
            .await
            .map_err(|e| js_error("Requesting SSH pty failed", e))?;

        log_info("[wasm-ssh] requesting shell");

        channel
            .request_shell(true)
            .await
            .map_err(|e| js_error("Requesting SSH shell failed", e))?;

        let (tx, mut rx) = mpsc::unbounded_channel::<SessionCommand>();
        *self.cmd_tx.lock().unwrap() = Some(tx);

        log_info("[wasm-ssh] shell established, starting channel pump");

        let output_clone = self.output.clone();
        wasm_bindgen_futures::spawn_local(async move {
            log_info("[wasm-ssh] channel pump started");
            loop {
                tokio::select! {
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                                output_clone.push_inbound(&data);
                            }
                            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                                log_info("[wasm-ssh] channel closed by remote peer");
                                break;
                            }
                            _ => {}
                        }
                    }
                    Some(cmd) = rx.recv() => {
                        match cmd {
                            SessionCommand::Data(data) => {
                                if let Err(_) = channel.data(&data[..]).await {
                                    log_error("[wasm-ssh] failed to send channel data");
                                    break;
                                }
                            }
                            SessionCommand::Resize { cols, rows } => {
                                if let Err(_) = channel.window_change(cols.max(1), rows.max(1), 0, 0).await {
                                    log_error("[wasm-ssh] failed to send terminal resize");
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            log_info("[wasm-ssh] channel pump stopped");
            output_clone.close();
        });

        *self.handle.lock().unwrap() = Some(handle);
        Ok(())
    }

    #[wasm_bindgen(js_name = pushServerBytes)]
    pub fn push_server_bytes(&self, data: &[u8]) {
        self.transport.push_inbound(data);
    }

    #[wasm_bindgen(js_name = drainOutput)]
    pub fn drain_output(&self) -> Vec<u8> {
        self.transport.drain_outbound()
    }

    #[wasm_bindgen(js_name = pollOutgoing)]
    pub async fn poll_outgoing(&self) -> Result<Vec<u8>, JsValue> {
        struct OutgoingFuture(SharedChannel);
        impl std::future::Future for OutgoingFuture {
            type Output = Vec<u8>;
            fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
                let mut state = self.0.0.lock().unwrap();
                if state.outbound.is_empty() {
                    if state.closed {
                        return Poll::Ready(vec![]);
                    }
                    state.write_waker = Some(cx.waker().clone());
                    return Poll::Pending;
                }
                let data = std::mem::take(&mut state.outbound);
                Poll::Ready(data)
            }
        }
        Ok(OutgoingFuture(self.transport.clone()).await)
    }

    #[wasm_bindgen(js_name = sendInput)]
    pub async fn send_input(&self, data: &[u8]) -> Result<Vec<u8>, JsValue> {
        let lock = self.cmd_tx.lock().unwrap();
        let tx = lock
            .as_ref()
            .ok_or_else(|| JsValue::from_str("not connected"))?;
        tx.send(SessionCommand::Data(data.to_vec()))
            .map_err(|_| JsValue::from_str("channel closed"))?;
        Ok(self.transport.drain_outbound())
    }

    #[wasm_bindgen(js_name = resizeTerminal)]
    pub async fn resize_terminal(&self, cols: u32, rows: u32) -> Result<Vec<u8>, JsValue> {
        let lock = self.cmd_tx.lock().unwrap();
        let tx = lock
            .as_ref()
            .ok_or_else(|| JsValue::from_str("not connected"))?;
        tx.send(SessionCommand::Resize { cols, rows })
            .map_err(|_| JsValue::from_str("channel closed"))?;
        Ok(self.transport.drain_outbound())
    }

    #[wasm_bindgen(js_name = pollOutput)]
    pub async fn poll_output(&self) -> Result<Vec<u8>, JsValue> {
        struct OutputFuture(SharedChannel);
        impl std::future::Future for OutputFuture {
            type Output = Vec<u8>;
            fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
                let mut state = self.0.0.lock().unwrap();
                if state.inbound.is_empty() {
                    if state.closed {
                        return Poll::Ready(vec![]);
                    }
                    state.read_waker = Some(cx.waker().clone());
                    return Poll::Pending;
                }
                let data: Vec<u8> = state.inbound.drain(..).collect();
                Poll::Ready(data)
            }
        }

        let data = OutputFuture(self.output.clone()).await;
        if data.is_empty() && self.output.0.lock().unwrap().closed {
            return Err(JsValue::from_str("session closed"));
        }
        Ok(data)
    }

    #[wasm_bindgen(js_name = close)]
    pub async fn close(&self) -> Result<(), JsValue> {
        self.cmd_tx.lock().unwrap().take();
        self.transport.close();
        self.output.close();
        Ok(())
    }
}

#[wasm_bindgen]
pub async fn connect(credentials: JsValue) -> Result<WasmSshSession, JsValue> {
    let session = WasmSshSession::new(credentials)?;
    session.connect().await?;
    Ok(session)
}

async fn authenticate(
    handle: &mut Handle<ClientHandler>,
    creds: &Credentials,
) -> Result<(), String> {
    log_info(format!(
        "[wasm-ssh] authenticating as {} using {} auth",
        creds.username,
        auth_method_name(&creds.auth_method)
    ));

    let ok = match &creds.auth_method {
        AuthMethod::Password { password } => handle
            .authenticate_password(&creds.username, password)
            .await
            .map_err(|e| e.to_string())?,
        AuthMethod::PrivateKey {
            private_key_pem,
            passphrase,
        } => {
            let key = decode_secret_key(private_key_pem, passphrase.as_deref())
                .map_err(|e| e.to_string())?;
            let hash_alg = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| e.to_string())?
                .flatten();
            handle
                .authenticate_publickey(
                    &creds.username,
                    PrivateKeyWithHashAlg::new(std::sync::Arc::new(key), hash_alg),
                )
                .await
                .map_err(|e| e.to_string())?
        }
    };

    if ok.success() {
        log_info("[wasm-ssh] authentication accepted by server");
        Ok(())
    } else {
        log_error("[wasm-ssh] authentication rejected by server");
        Err("SSH authentication rejected by server".to_owned())
    }
}

fn _assert_future(_: impl std::future::Future) {}

#[wasm_bindgen]
pub struct WasmSshPersistentExec {
    creds: Credentials,
    transport: SharedChannel,
    handle: Arc<Mutex<Option<client::Handle<ClientHandler>>>>,
}

#[wasm_bindgen]
impl WasmSshPersistentExec {
    #[wasm_bindgen(constructor)]
    pub fn new(credentials: JsValue) -> Result<WasmSshPersistentExec, JsValue> {
        let creds: Credentials = serde_wasm_bindgen::from_value(credentials)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmSshPersistentExec {
            creds,
            transport: SharedChannel::default(),
            handle: Arc::new(Mutex::new(None)),
        })
    }

    #[wasm_bindgen(js_name = pushServerBytes)]
    pub fn push_server_bytes(&self, data: &[u8]) {
        self.transport.push_inbound(data);
    }

    #[wasm_bindgen(js_name = drainOutput)]
    pub fn drain_output(&self) -> Vec<u8> {
        self.transport.drain_outbound()
    }

    #[wasm_bindgen(js_name = isConnected)]
    pub fn is_connected(&self) -> bool {
        self.handle.lock().unwrap().is_some()
    }

    #[wasm_bindgen(js_name = connect)]
    pub async fn connect(&self) -> Result<(), JsValue> {
        let channel_io = WsChannel(self.transport.clone());
        let config = std::sync::Arc::new(client::Config::default());

        let mut handle = client::connect_stream(
            config,
            channel_io,
            ClientHandler {
                expected_host_key: self.creds.expected_host_key.clone(),
                server_host_key: Arc::new(Mutex::new(None)),
            },
        )
        .await
        .map_err(|e| js_error("persistent exec: SSH connect failed", e))?;

        authenticate(&mut handle, &self.creds)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        *self.handle.lock().unwrap() = Some(handle);
        Ok(())
    }

    #[wasm_bindgen(js_name = execBytes)]
    pub async fn exec_bytes(&self, command: &str) -> Result<Vec<u8>, JsValue> {
        let handle_arc = self.handle.clone();

        let handle = handle_arc
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| JsValue::from_str("persistent exec: not connected"))?;

        let mut channel = handle
            .channel_open_session()
            .await
            .map_err(|e| js_error("persistent exec: channel open failed", e))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| js_error("persistent exec: exec failed", e))?;

        let mut output = Vec::new();
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Data { data }) => output.extend_from_slice(&data),
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }

        *handle_arc.lock().unwrap() = Some(handle);
        Ok(output)
    }

    #[wasm_bindgen(js_name = disconnect)]
    pub async fn disconnect(&self) -> Result<(), JsValue> {
        let handle = self.handle.lock().unwrap().take();
        if let Some(h) = handle {
            let _ = h
                .disconnect(russh::Disconnect::ByApplication, "", "en")
                .await;
        }
        self.transport.close();
        Ok(())
    }
}

#[wasm_bindgen]
pub struct WasmSshExecSession {
    creds: Credentials,
    transport: SharedChannel,
}

#[wasm_bindgen]
impl WasmSshExecSession {
    #[wasm_bindgen(constructor)]
    pub fn new(credentials: JsValue) -> Result<WasmSshExecSession, JsValue> {
        let creds: Credentials = serde_wasm_bindgen::from_value(credentials)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(WasmSshExecSession {
            creds,
            transport: SharedChannel::default(),
        })
    }

    #[wasm_bindgen(js_name = pushServerBytes)]
    pub fn push_server_bytes(&self, data: &[u8]) {
        self.transport.push_inbound(data);
    }

    #[wasm_bindgen(js_name = drainOutput)]
    pub fn drain_output(&self) -> Vec<u8> {
        self.transport.drain_outbound()
    }

    #[wasm_bindgen(js_name = execBytes)]
    pub async fn exec_bytes(&self, command: &str) -> Result<Vec<u8>, JsValue> {
        let channel_io = WsChannel(self.transport.clone());
        let config = std::sync::Arc::new(client::Config::default());

        let mut handle = client::connect_stream(
            config,
            channel_io,
            ClientHandler {
                expected_host_key: self.creds.expected_host_key.clone(),
                server_host_key: Arc::new(Mutex::new(None)),
            },
        )
        .await
        .map_err(|e| js_error("exec: SSH transport failed", e))?;

        authenticate(&mut handle, &self.creds)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        let mut channel = handle
            .channel_open_session()
            .await
            .map_err(|e| js_error("exec: channel open failed", e))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| js_error("exec: exec request failed", e))?;

        let mut output = Vec::new();
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Data { data }) => output.extend_from_slice(&data),
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }

        Ok(output)
    }
}
