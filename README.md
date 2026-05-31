# AICmd

**[中文文档](./README.zh.md)**

An AI-powered web SSH terminal that combines a full-featured terminal emulator with an autonomous AI agent. The AI understands your system environment, executes commands, analyzes logs, manages services — all through natural language conversation.

## Features

### AI Agent
- **Autonomous Operation**: AI agent directly executes commands in the terminal via tool calling (OpenAI function calling protocol). It observes output, makes decisions, and iterates until the task is done.
- **System Awareness**: Automatically detects OS, CPU, memory, disk, installed services, and available languages on first connection. The AI always knows what system it's working with.
- **Script Generation**: For complex multi-step tasks, the agent generates and executes scripts (Bash/Python/PowerShell) instead of running commands one by one.
- **Cross-Platform Intelligence**: Adapts commands based on target OS — uses `systemctl` on Linux, `launchctl` on macOS, `Get-Service` on Windows.

### Skills System
- **Built-in Skills**: Pre-configured operational playbooks for common tasks:
  - Server Health Check — comprehensive system metrics collection
  - Log Analysis — error pattern detection with Python/awk scripts
  - Docker Management — container lifecycle operations
- **Custom Skills**: Create your own skills as markdown files in `~/.aicmd/skills/`. Skills define domain-specific SOPs, project-specific knowledge, or any workflow the LLM doesn't already know.
- **Slash Commands**: Trigger skills with `/skill-name` in the chat input.

### Command Audit & Replay
- **Full Audit Trail**: Every command executed by the AI agent is automatically recorded with timestamp, session, command, output, duration, and status (success/error/blocked/rewritten).
- **Timeline View**: Browse audit logs by date with keyword search and status filtering.
- **Statistics Dashboard**: Overview of total commands, success/error/blocked counts.
- **Export**: Export audit logs as JSON or CSV for compliance and incident review.
- **Real-time Updates**: New audit entries appear instantly in the Audit panel via WebSocket.
- **Auto Cleanup**: Logs older than 30 days are automatically purged.

### Real-time Log Monitoring + AI Anomaly Detection
- **One-Click Tail**: Monitor any log file (`tail -f`) on remote SSH servers or local machine.
- **Pattern Detection**: Automatically detects ERROR, FATAL, CRITICAL, Exception, Traceback, and other anomaly patterns.
- **Alert System**: Categorized alerts (critical/error/warning) with timestamps and highlighted log lines.
- **AI Analysis**: Send recent log lines to the AI agent for intelligent anomaly analysis and recommendations.
- **Color-Coded Output**: Error lines in red, warnings in yellow, debug in dimmed — easy to scan.

### Batch Operations (Multi-Server)
- **Parallel Execution**: Select multiple active SSH sessions and execute the same command on all of them simultaneously.
- **Aggregated Results**: View per-server results with success/failure status, output, and execution time.
- **Server Selector**: Multi-select UI with Select All / Clear options, showing session names and connection types.
- **Expandable Details**: Click any result to see full command output, with copy-to-clipboard support.
- **Task History**: Recent batch tasks are stored for review.

### Terminal
- **SSH Remote Terminal**: Full SSH client based on xterm.js + ssh2 with 256-color support.
- **Local Shell**: Native local shell via node-pty (Bash/Zsh on macOS/Linux, PowerShell on Windows).
- **File Transfer**: rz/sz (ZMODEM) file upload and download with automatic binary handling.
- **Multi-Session**: Tab-based multi-session management with persistent state across restarts.
- **Auto-Reconnect**: One-click reconnection for dropped SSH sessions.
- **Session Persistence**: All sessions and chat history are persisted on the server side.

### General
- **Connection Management**: Visual SSH connection configuration (CRUD) with key-based and password auth.
- **i18n**: Chinese / English UI with runtime language switching.
- **Desktop App**: Cross-platform desktop client via Electron.
- **Chat History**: Persistent AI conversation history with browsing and restoration across sessions.

## Screenshot

![AICmd Screenshot](./screenshot.png)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite + Bootstrap 5 + xterm.js |
| Backend | Node.js + Express + WebSocket (ws) |
| SSH/PTY | ssh2 + node-pty |
| AI | OpenAI-compatible API (supports any compatible endpoint) |
| Build | Vite + TypeScript + electron-builder |

## Quick Start

### Install

```bash
npm install -g @fefeding/aicmd
# or
pnpm add -g @fefeding/aicmd
```

### Requirements

- Node.js >= 18

### Start Server

```bash
# Start (default port 9802, auto-finds available port)
aicmd start

# Custom port
aicmd start --port 3000

# Stop / Restart
aicmd stop
aicmd restart

# Version
aicmd -v
```

Then open http://localhost:9802 in your browser.

### Configure AI

1. Click the robot icon (bottom-left sidebar) or the gear icon in the AI chat header.
2. Enter your API Key and base URL (supports OpenAI, DeepSeek, Qwen, or any compatible API).
3. Choose a model (default: `gpt-4o-mini`).
4. Save and start chatting.

### Development

```bash
# Clone and install
git clone <repo-url>
pnpm install

# Dev mode (with hot reload)
pnpm dev
# Visit http://localhost:9801

# Build
pnpm build          # Frontend + server
pnpm build-server   # Server only

# Start production
node server.js --port 3000
```

### Desktop App (Electron)

```bash
pnpm electron:dev          # Dev mode
pnpm electron:build        # Current platform
pnpm electron:build:win    # Windows
pnpm electron:build:mac    # macOS
pnpm electron:build:linux  # Linux
```

## AI Usage Examples

### Natural Language Operations
```
You: Check if nginx is running and show recent error logs
AI: [executes systemctl status nginx, then reads error logs, provides analysis]

You: Find the top 5 processes consuming memory
AI: [generates and runs a ps/sort script, presents results as a table]

You: Clean up Docker images older than 7 days
AI: [runs docker system prune with filters, reports freed space]
```

### Using Skills
```
You: /server-health-check
AI: [generates a comprehensive health check script, executes it, analyzes all metrics]

You: /log-analyze /var/log/nginx/error.log
AI: [creates a Python analysis script, shows error distribution and patterns]
```

### AI Analysis
```
You: [Switch to Monitor tab, enter /var/log/nginx/error.log, click Start]
AI: [Real-time log streaming with anomaly detection]
    [Alert: CRITICAL - OutOfMemoryError detected at 14:23:05]
    [Click AI Analyze → AI summarizes error patterns and suggests fixes]
```

### Batch Operations
```
[Click the server rack icon in sidebar → Select 5 servers]
Command: systemctl status nginx
→ All 5 servers respond simultaneously with status output
→ Failed servers are highlighted in red with error details
```

### Custom Skills

Create `~/.aicmd/skills/my-deploy.md`:
```markdown
---
name: Deploy My App
description: Deploy the production application with zero-downtime
tags: [deploy, ops]
---

Steps to deploy:
1. Pull latest code from git
2. Run database migrations
3. Build assets
4. Restart with PM2 (graceful reload)
...
```

Then trigger with `/deploy-my-app` in the chat.

## Project Structure

```
.
├── bin/              # CLI entry (aicmd command)
├── data/skills/      # Built-in AI skills
├── dist/             # Build output
├── electron/         # Electron main process & preload
├── public/           # Static assets
├── scripts/          # Build scripts (Electron)
├── server/           # Server source (TypeScript)
│   ├── model/        # Entity definitions
│   ├── service/      # Business logic (AI, SSH, Skills, Audit, Monitor, Batch)
│   └── index.ts      # Server entry
├── src/              # Frontend source (Vue 3)
│   ├── components/   # Vue components
│   │   ├── ai-chat/  # AI chat panel (Chat / Audit / Monitor tabs)
│   │   ├── ai-settings/ # AI config modal
│   │   ├── audit-panel/ # Command audit timeline
│   │   ├── log-monitor/ # Real-time log monitoring
│   │   ├── batch-panel/ # Multi-server batch operations
│   │   └── ...       # Terminal, sidebar, etc.
│   ├── locales/      # i18n translations
│   ├── service/      # Frontend API services
│   ├── stores/       # Pinia state management
│   └── views/        # Page views
├── view/             # HTML templates
└── server.js         # Production startup
```

## Data Storage

All data is stored locally on the server:

| Data | Path |
|------|------|
| Connections | `~/.aicmd/connections.json` |
| Sessions | `~/.aicmd/sessions.json` |
| AI Config | `~/.aicmd/ai-config.json` |
| Chat History | `~/.aicmd/ai-history/` |
| Audit Logs | `~/.aicmd/audit/YYYY-MM-DD.jsonl` |
| User Skills | `~/.aicmd/skills/*.md` |
| Trash Bin | `~/.aicmd/.trash/` |

Use `AICMD_DATA_DIR` environment variable to override the data directory.

## Safety Mechanisms

The AI agent includes built-in command-level safety protections to reduce the risk of destructive operations:

### Delete Protection (Trash Bin)
- All `rm` commands (Linux/macOS) are automatically rewritten to `mv` into `~/.aicmd/.trash/` instead of permanent deletion.
- Windows `Remove-Item`/`del`/`rd` commands are similarly rewritten to `Move-Item` into `%USERPROFILE%\.aicmd\.trash\`.
- Trashed files are timestamped (e.g. `_del_1716000000_filename`) to avoid naming conflicts.
- To recover a file, simply browse the trash directory and move it back.

### Dangerous Operation Blocking
The following irreversible, destructive operations are blocked entirely:

| Platform | Blocked Operations |
|----------|-------------------|
| Linux/macOS | `rm -rf /`, `mkfs.*` (disk formatting), `dd of=/dev/sd*` (disk overwrite), fork bombs |
| Windows | `format C:`, `Clear-Disk`, `Remove-Item C:\`, `rd /s C:\` |

### Platform Awareness
The safety layer automatically detects the target session's OS (via systemContext) and applies the appropriate Unix or Windows rules — no manual configuration required.

## Cross-Platform Support

The terminal and AI agent work on:

| Platform | Shell | AI Scripting |
|----------|-------|-------------|
| Linux | bash/zsh | Bash + Python + Node.js |
| macOS | zsh/bash | Bash + Python + Node.js |
| Windows | PowerShell 7+/5.x | PowerShell + Python + Node.js |

The AI agent automatically detects the target OS and selects appropriate commands.

## License

MIT
