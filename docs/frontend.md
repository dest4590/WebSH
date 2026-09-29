## Complete Frontend Directory Contents

### **ROOT FILES**

#### [nuxt.config.ts](..\frontend\nuxt.config.ts)

Nuxt 3 configuration with:

- CSS imports from main.css and Tailwind
- Vite build optimization for xterm, dexie, codemirror, and crypto libraries
- PostCSS/Tailwind setup
- Sitemap generation configuration
- Runtime config for proxy and API base URLs
- Site metadata and OG tags

#### [tailwind.config.ts](..\frontend\tailwind.config.ts)

Tailwind CSS configuration with:

- Custom color palette (shell theme colors)
- Custom font families (Space Grotesk, IBM Plex Mono)
- Custom box shadows for shell design

---

### **PAGES**

#### [app.vue](..\frontend\app\app.vue)

Root app wrapper with:

- NuxtLayout and NuxtPage for routing
- Kernel preloader animation on app boot
- Vault unlock modal
- Global dialog host
- Vault unlock auto-check on mount

#### [layouts/default.vue](..\frontend\app\layouts\default.vue)

Main layout with:

- Vault state management (locks/unlocks/resets)
- Session storage for boot state
- Vault initialization and security prompts
- Confirmation dialogs for vault reset

#### [pages/index.vue](..\frontend\app\pages\index.vue)

Landing page with:

- Hero section ("SSH. In your browser")
- Feature highlights (Zero-Knowledge Vault, Rust + WASM, Terminal Tiling)
- Mock terminal demo showing SSH connection
- CTA buttons (Open App, Sign In)

#### [pages/login.vue](..\frontend\app\pages\login.vue)

Authentication page with:

- Login/Register toggle
- Email, password, name fields
- Password confirmation for registration
- Cloud sync pull option after login
- Error status messages
- Redirect to /app or custom query param

#### [pages/news.vue](..\frontend\app\pages\news.vue)

News system with:

- News list sidebar
- News detail view with HTML content rendering
- Comments section with delete functionality
- Emoji reactions (>_<, ^_^, O*O, T_T, -*-, (o*o), (^*^))
- Admin-only create/edit news modals
- Sync and storage from backend

#### [pages/plans.vue](..\frontend\app\pages\plans.vue)

Pricing page with:

- Starter (free) and Pro ($8/month) plan cards
- Feature comparison table
- Plan upgrade logic
- Current tier display based on user subscription

#### [pages/profile.vue](..\frontend\app\pages\profile.vue)

User profile page with:

- Account overview (email, tier, member since)
- Editable display name
- Account ID
- Pro member thank you message
- Auth-only access (redirects to /login)

#### [pages/app/index.vue](..\frontend\app\pages\app\index.vue)

Main application dashboard with:

- Full terminal workspace UI
- Server list (MainMenu component)
- Settings panel
- Snippets editor
- Tab bar for managing sessions
- BSP (Binary Space Partition) layout for tile splits
- Vault unlock integration
- Auto-sync for settings, servers, snippets
- Drag-and-drop tab reordering
- Activity-tracking for 5-min auto-lock

#### [pages/app/admin/index.vue](..\frontend\app\pages\app\admin\index.vue)

Admin panel with:

- User list table with subscription management
- Tier selection (free/pro)
- Subscription date range editing
- Admin flag toggle
- Tunnel node display

#### [pages/shared/[code].vue](..\frontend\app\pages\shared[code].vue)

Shared terminal viewer with:

- xterm read-only terminal display
- WebSocket connection to share publisher
- Live terminal output streaming
- Optional input support (for read-write shares)
- Share expiry notifications
- Status bar showing connection state

---

### **COMPONENTS** (In [app/components/](..\frontend\app\components/))

#### [AppHeader.vue](..\frontend\app\components\AppHeader.vue)

Navigation header with:

- WebSH logo/brand button
- Plans, News links
- Home, App buttons
- Pro badge display
- Profile, authentication buttons
- Sticky positioning with backdrop blur

#### [AppFooter.vue](..\frontend\app\components\AppFooter.vue)

Footer with copyright and privacy link

#### [AppStatusBar.vue](..\frontend\app\components\AppStatusBar.vue)

Terminal status bar showing:

- Active session name
- Connection status
- Session status message

#### [AppTabBar.vue](..\frontend\app\components\AppTabBar.vue)

Terminal session tab bar with:

- Draggable tabs
- Color dots for connection state (connected=emerald, connecting=amber, offline=zinc)
- Close buttons
- Menu, Settings, Snippets special tabs
- Connection history tracking
- Drop zone visualization during drag

#### [MainMenu.vue](..\frontend\app\components\MainMenu.vue)

Server browser/manager with:

- Server search
- Bookmarked servers section
- All servers grid
- Connect buttons for each server
- Edit/delete/bookmark actions
- Add Server and Import .ssh buttons
- Sensitive data hiding option

#### [BspTerminalLayout.vue](..\frontend\app\components\BspTerminalLayout.vue)

BSP layout grid manager (recursive) with:

- Split handling (horizontal/vertical)
- Kill split (back to single pane)
- Recursive node rendering
- Resize percentage updates

#### [BspTerminalNode.vue](..\frontend\app\components\BspTerminalNode.vue)

Individual terminal pane with:

- Draggable header for reordering
- Split buttons (vertical/horizontal)
- Share button (shows share URL if active)
- Detach button (show as tab)
- Close button
- Status header (connection state, labels)
- Terminal or Settings/Snippets content
- Server selection menu if not connected
- Resizable pane dividers with drag feedback
- Share modal (via Teleport)

#### [TerminalView.vue](..\frontend\app\components\TerminalView.vue)

xterm wrapper with:

- Dynamic terminal initialization (on visibility)
- Font family/size/spacing settings
- Theme application
- Keybinding handling
- Web fonts loading (JetBrains Mono)
- Download log button (exports terminal buffer)
- Lazy boot on visibility

#### [TerminalWrapper.vue](..\frontend\app\components\TerminalWrapper.vue)

Session mount point with:

- ResizeObserver for pane resize handling
- Session attach/detach on mount/unmount
- Fit terminal on resize

#### [Settings.vue](..\frontend\app\components\Settings.vue)

Settings panel with sections:

- **Appearance**: Theme selector, animations toggle, animation speed
- **Cloud Sync**: Autosync toggle, push/pull buttons for settings/servers/snippets
- **Security**: Vault unlock, reset vault
- **Privacy**: Hide sensitive data checkbox
- **Terminal**: Font size, font family, letter spacing, cursor blink

#### [SettingsRow.vue](..\frontend\app\components\SettingsRow.vue)

Single settings row with label, description, and control slot

#### [SettingsSection.vue](..\frontend\app\components\SettingsSection.vue)

Settings group container with title and description

#### [AddServerModal.vue](..\frontend\app\components\AddServerModal.vue)

Server add/edit dialog with:

- Name, host, port, username fields
- Auth type toggle (password vs SSH key)
- Password or private key upload
- Passphrase for encrypted keys
- Form validation and initial data loading
- Save/cancel actions

#### [VaultUnlockModal.vue](..\frontend\app\components\VaultUnlockModal.vue)

Vault authentication modal showing:

- Master password input
- Create or unlock messaging
- Error status display
- Reset button (if initialized and error occurs)

#### [ShareModal.vue](..\frontend\app\components\ShareModal.vue)

Terminal share UI with:

- Read-only toggle
- Create share button
- Copy link button
- Remaining time countdown (with progress bar)
- Stop sharing button
- Subscription upsell on expiry
- Error display

#### [Dialog.vue](..\frontend\app\components\Dialog.vue)

Generic dialog container with:

- Overlay, content, header/body/footer slots
- Close on backdrop click
- Teleport to body
- CSS animations (fade, slide)

#### [GlobalDialogHost.vue](..\frontend\app\components\GlobalDialogHost.vue)

Alert/confirm dialog host using useDialog composable

#### [Snippets.vue](..\frontend\app\components\Snippets.vue)

Bash snippet manager with:

- Snippet list with search
- CodeMirror syntax highlighting
- Title, script, run directory editing
- Save button
- Run mode: current terminal or new pane
- Server selection for new pane mode
- Run button with script execution
- Automatic detection of connected sessions
- Free plan limit (5 snippets)

#### [Checkbox.vue](..\frontend\app\components\Checkbox.vue)

Custom checkbox component with check icon

#### [ToggleSwitch.vue](..\frontend\app\components\ToggleSwitch.vue)

Switch toggle component with animated indicator

---

### **COMPOSABLES** (In [app/composables/](..\frontend\app\composables/))

#### [useAnimations.ts](..\frontend\app\composables\useAnimations.ts)

FLIP (First, Last, Invert, Play) animation utilities:

- `runFlip()`: Animates element position changes during BSP rearrangement
- `handleClosePane()`: Animates pane closing with cloned element animation
- Duration parsing and configuration

#### [useApi.ts](..\frontend\app\composables\useApi.ts)

API client utilities:

- `request<T>()`: Typed fetch wrapper with auth headers
- `authHeaders()`: Bearer token header builder
- API base URL resolution (runtime config or fallback to :5151)

#### [useAuth.ts](..\frontend\app\composables\useAuth.ts)

Authentication state management:

- `token`, `user`, `status`, `pending` refs
- `restoreSession()`: Loads from sessionStorage
- `login()`, `register()`: Auth endpoints
- `logout()`: Clears session
- `updateProfile()`: Updates user name
- Session persistence with sessionStorage

#### [useDialog.ts](..\frontend\app\composables\useDialog.ts)

Dialog/modal utilities:

- `showAlert()`: Promise-based alert
- `showConfirm()`: Promise-based confirmation
- Customizable title, labels, max-width

#### [useKeybindings.ts](..\frontend\app\composables\useKeybindings.ts)

Keybinding definitions and storage:

- Default bindings: Ctrl+\, Ctrl+-, Ctrl+Shift+E, Ctrl+B, Ctrl+Tab, Ctrl+W
- localStorage persistence
- Action mapping (split-right, split-down, unsplit, toggle-sidebar, cycle-tabs, close-tab)

#### [useServers.ts](..\frontend\app\composables\useServers.ts)

Server profile management:

- `refreshServers()`: Load from Dexie DB
- `saveServer()`: Encrypt and store, or update
- `prepareEditServer()`: Decrypt for editing
- `removeServer()`, `toggleBookmark()`
- `importSshFolder()`: Parse .ssh/config and import keys
- `parseSshConfig()`: SSH config parser
- `replaceAll()`: Sync incoming servers from cloud

#### [useSettings.ts](..\frontend\app\composables\useSettings.ts)

UI settings management:

- `settings` ref with defaults (fontSize, fontFamily, theme, animations, etc.)
- localStorage persistence
- `replaceSettings()`: Apply synced settings
- CSS var updates for --transition-duration
- Animation speed constants (slow/normal/fast)

#### [useSnippets.ts](..\frontend\app\composables\useSnippets.ts)

Bash snippet storage:

- Free plan limit: 5 snippets
- `addSnippet()`, `updateSnippet()`, `removeSnippet()`
- `refreshSnippets()`: Load from DB
- `replaceAll()`: Sync from cloud

#### [useSshSession.ts](..\frontend\app\composables\useSshSession.ts)

SSH/WASM session management:

- `connectionState`: offline/connecting/connected
- `connectToServer()`: WebSocket relay + WASM SSH engine
- `sendInput()`, `resizeTerminal()`: Terminal I/O
- Host key verification and trust flow
- Output history (200KB buffer) with terminal write batching
- OutputTap for share streaming
- Auth method: password or private key + passphrase

#### [useSync.ts](..\frontend\app\composables\useSync.ts)

Cloud sync (settings/servers/snippets):

- `pushData()`, `pullData()`: Encrypted sync to /sync/{dataType}
- Specialized sync for settings, servers, snippets
- `syncStatus`: idle/syncing/ok/error
- `lastSyncAt` timestamp
- Pro-only feature check

#### [useTerminalShare.ts](..\frontend\app\composables\useTerminalShare.ts)

Terminal sharing:

- `startSharing()`: POST /share/create, open publisher WebSocket
- `stopSharing()`: Cleanup and DELETE /share/{code}
- Read-only vs read-write mode
- Expiry countdown (free: 10 min, pro: unlimited)
- `onExpired` callback
- Share URL construction

#### [useTerminalTabs.ts](..\frontend\app\composables\useTerminalTabs.ts)

Terminal/tab layout management (legacy/alternate system):

- `addTab()`, `removeTab()`: Session creation/removal
- Layout: single/split-h/split-v/2x2
- Pane-to-tab mapping

#### [useTerminalTheme.ts](..\frontend\app\composables\useTerminalTheme.ts)

Terminal color themes:

- 4 built-in themes: Dracula, One Dark, Solarized Dark, Monokai
- `currentTheme` computed property with getter/setter
- Color palette definitions (16 colors + background/foreground)

#### [useTerminalWorkspace.ts](..\frontend\app\composables\useTerminalWorkspace.ts)

Core BSP terminal workspace (700+ lines):

- **Layout structure**: LayoutNode (leaf/split, direction, percentage)
- **Session management**: Create, dispose, attach, detach
- **BSP operations**:
    - `splitVertical()`, `splitHorizontal()`: Add split
    - `placeSession()`: Drag-drop pane placement (left/right/top/bottom)
    - `detachPane()`: Remove from layout to tab bar
    - `closePane()`: Close pane + session
    - `updateSplitPercentage()`: Resize splitter
    - `moveFocus()`: Keyboard navigation between panes
- **Active tab management**: setActiveTab, reorderTab
- **xterm creation**: With FitAddon, SearchAddon, WebLinksAddon, Unicode11Addon
- Settings and theme watches (applies to all terminals)
- Stub implementation for server-side

#### [useVault.ts](..\frontend\app\composables\useVault.ts)

Local vault (IndexedDB) management:

- `masterPassword` ref
- `vaultInitialized`, `vaultReady` bools
- `unlockVault()`: Password verification
- `lockVault()`: Clear password, lock
- `resetVault()`: Wipe vault, servers, snippets, settings
- Auto-lock on 5-min inactivity
- `refreshVaultState()`: Check if vault exists

#### [useVaultCrypto.ts](..\frontend\app\composables\useVaultCrypto.ts)

Lazy loader for vault crypto library (from ~/lib/vault)

---

### **CSS** ([main.css](..\frontend\app\assets\css\main.css))

Comprehensive stylesheet with:

- CSS custom properties (--bg, --surface, --border, --text, etc.)
- xterm styling and overrides
- Form elements (.ws-input, .ws-label, .ws-btn, .ws-btn-primary)
- Dialog styling
- Terminal tab styling (.terminal-tab, .terminal-tab-active, .terminal-tab-drop-\*)
- Scrollbar theming (webkit + FF)
- Animations (fadeIn, slideUp)
- Text size utilities (.text-sm, .text-xs, .text-xxs)
- FLIP animation styles

---

### **SUMMARY**

The **WebSH frontend** is a sophisticated Nuxt 3 + Vue 3 application with:

1. **Terminal UI**: xterm-based multi-pane SSH client with binary space partition (BSP) tiling layout
2. **Encryption**: Client-side vault with AES-GCM, PBKDF2, ChaCha20, Argon2 (via @noble libs)
3. **SSH**: Rust WASM SSH engine with key file/password auth and host key verification
4. **Cloud Sync**: End-to-end encrypted sync for settings, servers, snippets
5. **Sharing**: Terminal sharing via WebSocket with read-only mode and 10-min free limit
6. **Auth**: JWT-based backend auth with subscription tiers
7. **Admin**: User subscription management and tunnel node configuration
8. **Settings**: Appearance, terminal, security, cloud sync, privacy controls

The architecture is modular with clear separation between pages, components, composables (state/logic), and utilities.
