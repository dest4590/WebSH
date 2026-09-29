# WebSH (Web-based SSH Client)

WebSH is a web-based SSH terminal. Server profiles stay encrypted at rest in the browser, and the backend establishes the live SSH session using a native Rust SSH client.

## Tech Stack

- **Frontend**: Nuxt 3 + TailwindCSS 4 + Xterm.js
- **WASM Module**: Legacy browser-side experiment for SSH framing.
- **Backend**: Rust (Axum) acting as an orchestrator and load balancer.
- **Tunnel Nodes**: Lightweight Rust relays (`websh-tunnel`) for distributed traffic.
- **Security**: AES-GCM encryption for local storage (IndexedDB via Dexie.js) with pinned SSH host fingerprints per profile.
- **Account Auth**: Email/password auth backed by SQLite, Argon2 password hashing, and JWT sessions.

## Project Structure

- `backend/`: Rust Axum server for orchestration and load balancing.
- `wasm-ssh/`: Rust crate for the SSH bridge, compiled to WASM.
- `frontend/`: Nuxt 3 application with the terminal UI.

## Getting Started

### 1. Build the WASM Module

Ensure you have `wasm-pack` installed.

```bash
cd frontend
npm run wasm:build
```

### 2. Run the Backend Proxy

```bash
cd backend
cargo run
```

The proxy will start on `0.0.0.0:5151`.
and `TUNNEL_SECRET` to long random values. The backend stores user accounts in SQLite at `AUTH_DB_PATH` and creates the schema automatically on startup.
`AUTH_JWT_SECRET` is required and the backend refuses to start if it is missing or left at the placeholder value.

### 3. Run a Tunnel Node (Optional)

To distribute traffic, you can run tunnel nodes on different servers.

```bash
cd tunnel
export TUNNEL_SECRET=your-shared-secret
cargo run
```

The tunnel node starts on `0.0.0.0:5152`.

Configure the backend to use nodes in one of two ways:

- YAML file: create a YAML file with an array of nodes and set `TUNNEL_NODES_FILE` to its path:

Example YAML (`backend/nodes.yaml`):

```yaml
- name: eu1
	url: http://node-ip:5152
	tier: free
- name: pro1
	url: http://pro-node-ip:5152
	tier: pro
```

If neither is provided, the backend will create a single local mock node (`mock1` at `http://localhost:8080`) for development.

### 4

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Accounts

- `POST /auth/register` creates a user and returns a JWT plus the current user profile.
- `POST /auth/login` verifies the email/password pair and returns the same payload.
- `ghcr.io/dest4590/websh-tunnel:latest`
- `GET /auth/me` validates an existing JWT.
- `/ws` accepts guest access with no token, and uses a token only when an authenticated session is present.

The browser vault is still separate from account login. Users can open the app as guests and unlock the local vault master password to use stored SSH credentials. Accounts are reserved for future paid subscriptions and other account-linked features.

## CI / Docker image publishing

This repository includes a GitHub Actions workflow at `.github/workflows/docker-publish.yml`.

On push to `main`, it builds and pushes:

- `ghcr.io/dest4590/websh-backend:latest`
- `ghcr.io/dest4590/websh-frontend:latest`

For production deployment, use the image-only compose file at `docker-compose.yml`.

First log in to GHCR:

```bash
docker login ghcr.io -u dest4590
```

Then start the published images without building locally:

```bash
docker compose up --no-build
```

CI builds and publishes the images to GHCR via `.github/workflows/docker-publish.yml`, so the server compose file does not perform any local builds.
