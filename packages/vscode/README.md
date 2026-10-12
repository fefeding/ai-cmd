# AICmd Terminal — VSCode Extension

Bring [AICmd](https://github.com/fefeding/ai-cmd) (an AI-powered web SSH terminal) directly into VSCode. The extension launches AICmd's backend service (Express + WebSocket) inside the VSCode extension host and loads its front-end SPA through a WebView, so **every AICmd feature works inside VSCode with zero changes to any business code**:

## Screenshot

![AICmd Terminal in VSCode](https://raw.githubusercontent.com/fefeding/ai-cmd/main/docs/images/vscode-extension.png)

- SSH / local terminal (xterm.js + ssh2 / node-pty)
- Autonomous AI Agent (OpenAI function-calling protocol)
- Skills system (built-in skills + custom `/skill`)
- Command audit & replay (timeline / stats / export)
- Real-time log monitoring + AI anomaly detection
- Batch operations (parallel multi-server execution)
- Jump host & SSH agent forwarding
- File transfer (rz/sz ZMODEM, SFTP upload/download)

> The extension reuses the **same project** (this repository) at runtime: it starts the project's own `server.js` as a child process and serves the project's own `dist/` front-end. No separate AICmd install is required.

## How It Works

```
VSCode Extension Host
  └─ child process: node server.js --port <random free port>   (reuses project root backend, bound to 127.0.0.1)
        ├─ REST API   /api/**
        └─ WebSocket  /ws/terminal
  └─ WebView (iframe → http://127.0.0.1:<port>/)   (same-origin front-end SPA)
```

- The backend runs as a **child process** that reuses the project root's `server.js`, so all features are reused unchanged.
- The WebView loads the front-end through a **same-origin iframe**, which means the API / WebSocket are same-origin — no token or CORS handling is needed.
- The data directory defaults to `~/.aicmd` (overridable via the `aicmd.dataDir` setting) and is **shared with the standalone desktop / CLI AICmd** — the same `connections.json` and other files. A connection added in VSCode is visible in the desktop app, and vice versa.

## Requirements

- VSCode `^1.75.0` or later.
- A built AICmd project (front-end + backend) — see [Local Development](#local-development).
- Node.js available to launch the backend. The extension locates a `node` binary automatically (see [Environment Variables](#environment-variables)); you normally do not need to set anything.

## Installing the Extension

### From a packaged `.vsix`

```bash
# Build the package first (see Packaging below), then install:
code --install-extension aicmd-terminal-*.vsix
```

### From source (development)

See [Local Development](#local-development). After compiling, press **F5** in VSCode to launch the *Extension Development Host*.

## Usage

### Open the Activity Bar

After activating the extension, an **AICmd** icon appears in the left Activity Bar. Click it to reveal the **Terminal** explorer view, which lists:

- **Open Local Shell** — opens a native local shell (`__local__` connection) inside a VSCode WebView tab.
- **Saved connections** — every connection from `~/.aicmd/connections.json` (shared with the desktop / CLI). SSH connections show a globe icon; local connections show a terminal icon, with the host and username as a description.
- **No connections yet** hint — appears when the connection list is empty; click the **+** button in the view title to add one.

### Open a terminal

You can open a terminal in three ways:

1. **Command Palette**: press `Ctrl/Cmd + Shift + P`, then run **`AICmd: 打开终端`** (command id `aicmd.openTerminal`).
2. **Activity Bar → Terminal view**: click the **Open Local Shell** entry, or click any connection node to open that connection.
3. **Connection node inline action**: hover a connection in the Terminal view and click the terminal icon that appears on the right.

The first launch automatically finds an available port and starts the backend service, then opens the terminal UI in a WebView. Re-opening the same connection appends a number to the tab title (`server 2` / `server 3` …) so multiple sessions stay distinguishable.

### Manage connections

All connection management reuses the same backend and storage as the desktop / CLI app:

- **Add connection**: click the **+** button in the Terminal view title bar (or run `aicmd.addConnection`). A dedicated connection-editor WebView opens; fill in host/port/auth and save.
- **Edit connection**: right-click a connection → **Edit**, or run `aicmd.editConnection`. The same editor WebView opens pre-filled. After saving, the tree refreshes automatically and the editor closes.
- **Delete connection**: right-click a connection → **Delete**, or run `aicmd.deleteConnection`. A confirmation dialog appears; confirming removes the connection via the backend API and refreshes the tree.
- **Refresh**: click the **⟳** button in the view title bar (or run `aicmd.refresh`) to re-read the connection list from the backend.

> The connection editor is the same `ConnectionEditor` component used by the desktop app, so startup scripts and SSH agent forwarding for jump-host workflows are fully supported here too.

### Configure AI

1. In the terminal WebView, click the robot icon (bottom-left sidebar) or the gear icon in the AI chat header.
2. Enter your API Key and Base URL (OpenAI, DeepSeek, Qwen, or any compatible endpoint).
3. Choose a model (default: `gpt-4o-mini`) and save.
4. You can now chat with the AI Agent in natural language — it observes terminal output, runs commands, and iterates until the task is done.

### File download (sz / ZMODEM)

When a terminal session triggers a file download (e.g. `sz file`), the WebView posts a save request to the extension host. VSCode shows a native **Save As** dialog; choose a destination and the file is written to disk.

### Stopping the backend

The backend child process starts on demand and **stops automatically** when all AICmd WebView panels are closed (and no editor panel is open). It also stops when the extension is deactivated. If the backend crashes unexpectedly, all panels close and an error notification is shown; re-open a terminal to restart it.

## Settings

Open **Settings → Extensions → AICmd** (or add to `settings.json`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `aicmd.dataDir` | string | `~/.aicmd` | Data directory for connections / sessions / AI config / audit logs. Leave empty to share the desktop / CLI `~/.aicmd`. |
| `aicmd.startPort` | number | `9802` | Starting port used when launching the AICmd service inside VSCode. If occupied, the extension scans forward for a free port. |

> Changing `aicmd.dataDir` or `aicmd.startPort` requires reloading the VSCode window to take effect (a notification prompts you to reload).

## Environment Variables

- `AICMD_NODE`: Path to the `node` executable used to launch the backend. By default the extension prefers the VSCode host runtime (Electron), then falls back to nvm / Homebrew / system node. Set this only if auto-detection fails.
- `AICMD_DATA_DIR`: Overrides the data directory for connections / sessions / AI config / audit logs (default `~/.aicmd`). Takes precedence over `aicmd.dataDir` setting.
- `AICMD_AUTH_DISABLED`: Set to `1` to disable local token authentication (rarely needed).

> The local-shell entry uses the special connection id `__local__`, which makes the backend spawn a local terminal session directly.

## Local Development

```bash
# 1. Install dependencies (ensure node-pty is compiled for your local Node)
pnpm install

# 2. Build the front-end + backend (produces dist/)
pnpm build-only

# 3. Install the extension's own build deps and compile the extension host
cd packages/vscode
npm install        # installs esbuild / @types/vscode / vsce
npm run compile    # or `npm run watch` for continuous rebuild
cd ../..

# 4. Press F5 in VSCode to launch the "Extension Development Host"
```

The F5 launch uses a `preLaunchTask` that automatically runs `pnpm build:vscode` (front-end + backend + extension host together).

## Packaging & Publishing

```bash
pnpm build:vscode      # build front-end + backend + extension host
cd packages/vscode
vsce package           # produce a .vsix
vsce publish
```

> The distributed package must include the runtime (`server.js`, `dist/`, `data/skills`, and `node_modules` with the native `node-pty`). The current layout targets **in-repo development / source distribution**. For cross-machine installation, copy the runtime into `packages/vscode/runtime/` (`server.js`, `dist`, `data`) before running `vsce package` — the extension automatically prefers that directory when present.

## Notes

- The extension's backend listens only on `127.0.0.1`, and the WebView loads the front-end from the same origin, so no network exposure or token is required.
- Backend logs are written to the **Output** panel → channel **AICmd** for troubleshooting startup issues.
- The WebView follows your VSCode color theme (light / dark / high-contrast) automatically.
