# Project Overview: WebSH (Security-focused)

## Purpose and Primary Uses

- Provide secure, browser-based interactive shell access to remote servers.
- Store and manage user SSH profiles, snippets, and server configurations for single-user and collaborative workflows.
- Offer a managed news/announcements channel and administrative controls for server onboarding.

## Who Uses It

- End users: developers and operators using browser terminals.
- Administrators: manage accounts, servers, and published content.
- Integrations: optional identity providers, sync endpoints, and automation systems.

## How Secrets and Encryption Are Handled (High-Level)

- Client-side encrypted vault: user secrets (private keys, saved profiles) are kept encrypted in the browser and unlocked by the user with a local master secret. The system treats the vault as a client-side protected store and does not perform automatic, server-side decryption on behalf of users.
- Strong password hashing for accounts: user passwords are protected with slow, memory-hard hashing before being stored, reducing risk from leaked credential stores.
- Transport security: all network communications are expected to be protected in transit (HTTPS / TLS) so credentials and session tokens are not exposed on the wire.
- Session tokens: short-lived authenticated sessions use signed tokens which the backend verifies for access control decisions.
- Tunnel authentication: relay/tunnel nodes require a shared secret to join the tunnel network; tunnel traffic is brokered through authenticated relays.

## Specific Security Features (What the implementation uses)

- Encrypted local storage for profiles and secrets (browser-side encryption using modern AEAD ciphers).
- End-to-end encrypted sync option for cloud-backed synchronization, keeping data encrypted during transit and at rest outside the client.
- Memory-hard password hashing for user accounts to protect against offline attacks.
- Signed session tokens for authenticated APIs to prevent session forgery.
- Pinned host fingerprints for SSH profiles to reduce man-in-the-middle risk when connecting to servers.

## Why This Design Is Secure (Rationale)

- Secrets stay encrypted under user control: private keys and vault entries are only decrypted after the user explicitly unlocks the vault in their browser.
- Separation of concerns: account authentication, secret storage, and live connection orchestration are separated so a compromise in one layer does not automatically expose plaintext secrets in another.
- Secure defaults and explicit secrets: deployers must supply strong JWT and tunnel secrets; the software expects these values and enforces authenticated tunnels and signed sessions.
- Audit and isolation: administrative actions and key synchronization are recorded so operators can inspect changes and detect misuse. User sessions and terminal instances are isolated to avoid cross-user leakage.

## Data Handling and Persistence (High-Level)

- Account metadata and non-secret profiles are stored persistently on the backend for user management and sync metadata.
- Encrypted vault entries and local profile ciphertext are stored in the browser (IndexedDB). Backups of this ciphertext remain encrypted without the user's master secret.
- Transient session state (active terminals and ephemeral session buffers) is ephemeral and scoped to active connections.

## Typical Secure Workflows

- User opens the app, unlocks their local vault (decrypts private keys in-browser), and initiates a terminal session to a selected server.
- The backend (or a tunnel node) brokers the live connection; the client never uploads plaintext private keys to the server.
- When cloud sync is enabled, encrypted blobs are synced; only clients with the correct master secret can decrypt synced data.

## Operational Recommendations for Security

- Use strong, randomly generated values for JWT secrets and tunnel secrets and rotate them periodically.
- Enforce HTTPS/TLS at the edge and ensure tunnel nodes are run with a securely provisioned secret.
- Treat browser vault backups as encrypted artifacts; losing the master secret means data cannot be recovered.
- Regularly review audit logs and access control policies for unexpected changes.

## Limitations and Considerations

- The system is not a general-purpose secure file store; it focuses on SSH profiles and ephemeral terminal sessions.
- If a user exposes their master vault secret locally, their keys can be used by the browser session–user hygiene matters.
