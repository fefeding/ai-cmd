# AICmd — AI SSH / RDP 终端、远程桌面与运维智能体（VS Code 插件）

**一个扩展即可在 VS Code 内使用 AI 驱动的 SSH 终端、Windows 远程桌面和本地 Shell。** 通过 SSH 连接服务器、用 RDP 打开图形化 Windows 桌面、让 AI Agent 用自然语言执行命令并分析日志、传输文件（SFTP / ZMODEM / RDP 剪贴板）、审计每条命令，并对多台服务器批量执行任务——无需离开编辑器。

[English](#english-documentation) · [GitHub 仓库](https://github.com/fefeding/ai-cmd) · [问题反馈](https://github.com/fefeding/ai-cmd/issues)

> 扩展详情页始终展示本文件，因此中文文档直接内嵌在下方；英文文档见后文。扩展内 WebView 界面默认跟随 VS Code / CodeBuddy 的界面语言，也可在侧边栏手动点击「中 / EN」切换。

## 功能特性

| | |
|---|---|
| **SSH 与本地终端** | 基于 `ssh2` / `node-pty` 的完整 xterm.js 终端（256 色、多标签页、自动重连） |
| **Windows 远程桌面（RDP）** | 浏览器内 IronRDP-WASM 图形桌面——**无需 guacd、无需本地 RDP 客户端、目标机无需安装第三方软件**。支持鼠标/键盘、全屏、剪贴板同步和文件传输。 |
| **AI Agent** | 兼容 OpenAI function calling（OpenAI / DeepSeek / 通义千问或任意兼容端点）：读取终端输出、执行命令并迭代直到任务完成 |
| **Skills 技能** | 内置运维操作手册，并支持自定义 `/skill` Markdown 技能 |
| **文件传输** | SFTP 上传/下载、`rz` / `sz` ZMODEM 原生另存对话框、RDP CLIPRDR 文件复制——本机复制后在远程桌面按 `Ctrl/Cmd + V`，或使用工具栏上传/下载按钮 |
| **命令审计与回放** | AI 执行的每条命令都记录输出、耗时和状态；支持时间线、统计与 JSON / CSV 导出 |
| **日志监控** | `tail -f` 异常模式检测与 AI 智能分析 |
| **批量操作** | 在多台服务器并行执行同一命令并汇总结果 |
| **跳板机与 SSH Agent 转发** | 每个连接可配置启动脚本，自动发现本机 SSH Agent |

连接配置与桌面端 / CLI 共用 `~/.aicmd`。

## 快速开始

1. 安装扩展（从插件市场安装，或执行 `code --install-extension fefeding.vscode-aicmd`），然后点击活动栏中的 **AICmd** 图标。
2. 点击 **打开本地 Shell** 进入本地终端，或点击 **+** 新增连接：
   - **SSH**：填写主机、端口（22）、密码 / 私钥 → 打开终端；
   - **Windows 远程桌面（RDP）**：填写主机、端口（3389）、用户名 / 密码 → 打开图形桌面。
   在视图中点击连接即可打开。
3. *可选*：点击机器人图标，设置兼容 OpenAI 的 API Key + Base URL，然后用自然语言提问，例如“检查磁盘占用并找出最大的日志文件”。

无需单独安装 AICmd——发布包自带前端和后端，按需在 `127.0.0.1` 启动服务，最后一个面板关闭时自动停止。

## 为什么选择 AICmd，而不是普通终端 / RDP 客户端？

- **终端 + 桌面 + AI 运维一体**：真正的远程终端 *和* Windows 图形桌面 *和* 能根据所见内容采取行动的 Agent——无需 mstsc、无需 guacd、无需把输出复制到聊天机器人。
- **轻量远程桌面**：RDP 协议栈在浏览器 WebAssembly 中运行；本地服务只做字节隧道。目标机除 Windows 自带的远程桌面外无需安装任何软件。
- **默认可审计**：AI 执行的每条命令都会被记录，并提供时间线、统计和导出供复查。
- **面向多机**：批量命令、日志监控、跳板机 / Agent 转发工作流覆盖多服务器场景。
- **配置共享**：连接、会话和 AI 设置保存在 `~/.aicmd`，与独立运行的桌面版 / CLI 共享。VS Code 中新增的连接在桌面应用中同样可见，反之亦然。

## 工作原理

```
VSCode 扩展宿主
  └─ 子进程：node server.js --port <随机可用端口>   （复用项目根后端，绑定 127.0.0.1）
        ├─ REST API        /api/**
        ├─ 终端 WS         /ws/terminal   （JSON 协议，ssh2 / node-pty）
        └─ RDP 隧道 WS     /ws/rdp        （二进制 RDCleanPath 字节 → Windows:3389）
  └─ WebView（iframe → http://127.0.0.1:<port>/）   （同源前端 SPA）
        ├─ SSH / 本地 → xterm.js 终端
        └─ RDP        → IronRDP-WASM（浏览器内协议栈 + Canvas 渲染）
```

- 后端作为 **子进程** 复用项目根目录的 `server.js`，因此所有功能原样复用。
- WebView 通过 **同源 iframe** 加载前端，API / WebSocket 同源，不需要 token 或 CORS 处理。
- RDP 基于 **IronRDP-WASM**：协议栈在浏览器内运行，本地服务只把字节转发到配置中的 Windows 主机（忽略客户端声明的目标地址，防止 SSRF），无 `guacd` 守护进程。
- 数据目录默认为 `~/.aicmd`（可通过 `aicmd.dataDir` 设置覆盖），与桌面版 / CLI **共享**同一份 `connections.json` 等文件。

## 环境要求

- VS Code `^1.75.0` 或更高版本（Windows / macOS / Linux）。
- 发布版扩展已自带前端、后端运行时和 RDP WASM 模块——**无需单独安装 AICmd、guacd 或 RDP 客户端**。只有源码开发才需要本地构建，见[本地开发](#本地开发)。
- 需要 Node.js 启动后端。扩展会自动查找 `node`（见[环境变量](#环境变量)），通常无需设置。
- RDP：目标 Windows 需**启用远程桌面**且 TCP 3389 可达，其余由扩展的 WASM 客户端处理。

## 安装扩展

### 从 `.vsix` 安装

```bash
# 先构建安装包（见下方打包说明），然后安装：
code --install-extension aicmd-terminal-*.vsix
```

### 从源码安装（开发）

见[本地开发](#本地开发)。编译后在 VS Code 中按 **F5** 启动 *扩展开发宿主*。

## 使用说明

### 打开活动栏

扩展激活后，左侧活动栏出现 **AICmd** 图标。点击后显示 **连接** 视图，包含：

- **打开本地 Shell** —— 在 VS Code WebView 标签页中打开本地原生 Shell（`__local__` 连接）。
- **已保存的连接** —— 来自 `~/.aicmd/connections.json` 的所有连接（与桌面版 / CLI 共享）。SSH 显示地球图标，**RDP 显示显示器图标**，本地连接显示终端图标；描述中包含主机和用户名。
- **暂无连接** 提示 —— 连接列表为空时显示；点击视图标题的 **+** 按钮添加。

### 打开连接

有三种方式打开终端或远程桌面：

1. **命令面板**：按 `Ctrl/Cmd + Shift + P`，运行 **`AICmd: 打开连接（终端 / 远程桌面）`**（命令 id `aicmd.openTerminal`）。
2. **活动栏 → 连接视图**：点击 **打开本地 Shell** 条目，或点击任意连接节点（SSH → 终端，RDP → 图形桌面）。
3. **连接节点内联按钮**：在视图中悬停连接，点击右侧操作图标。

首次打开会自动寻找可用端口、启动后端服务，并在 WebView 中打开界面。重复打开同名连接会追加编号（`server 2` / `server 3` …）以区分多个会话。

### Windows 远程桌面（RDP）

1. 在目标 Windows 上启用 **设置 → 系统 → 远程桌面 → 启用远程桌面**，并确认 TCP 3389 可达。
2. 在 AICmd 中点击 **+** → 连接类型选择 **Windows 远程桌面（RDP）** → 填写主机、端口（默认 **3389**）、用户名、密码和域（域账号填写，本地账号留空）。屏幕尺寸默认 1280×800，可调整。
3. 点击连接：WebView 中打开图形桌面，支持鼠标/键盘输入和分辨率自适应。

> CredSSP 默认启用。RDP 协议栈完全通过 IronRDP-WASM 在浏览器内运行，无需 guacd 或本地 RDP 客户端。

#### 剪贴板（纯文本）

文本剪贴板同步是**实时的**：在本机复制文本后，在远程桌面内按 `Ctrl/Cmd + V`——粘贴发生时当前本机剪贴板内容会被推送到 RDP 通道（而不是连接建立时抓取的旧值）。远程复制的文本会自动写回本机剪贴板。工具栏的**剪贴板**按钮也可按需推送当前本机文本。

#### 把文件复制到远程桌面

文件传输使用 RDP **CLIPRDR** 通道。以下三种方式都需要**最后在远程桌面内粘贴**，远程才能拉取文件内容：

| 方式 | 步骤 |
|---|---|
| **本机复制文件 + 粘贴（推荐）** | 在系统文件管理器（Finder / 资源管理器）中复制文件，点击远程桌面使其获得焦点，然后在**远程桌面内**按 `Ctrl/Cmd + V`。文件从原生粘贴事件获取并立即发送到远程，一次按键完成，无额外对话框。VS Code 扩展同样支持（WebView 内使用隐藏的可编辑粘贴目标，使跨域 iframe 也能收到文件剪贴板）。 |
| **工具栏上传** | 点击 RDP 工具栏的**上传**（📤）按钮，选择一个或多个文件，然后在**远程桌面内**按 `Ctrl/Cmd + V`（或在目标文件夹右键 → 粘贴）完成传输。界面会弹出提示提醒这一步。 |
| **拖拽** | 把系统里的文件拖到远程桌面画布上，然后在远程桌面内按 `Ctrl/Cmd + V` 粘贴。 |

传输开始后，桌面底部的**文件传输面板**显示每个文件的名称和状态（`等待远程粘贴` → 已传输）。大文件分块流式传输。

> **macOS**：`Cmd + V` 会映射为远程 Windows 的 `Ctrl + V`，Mac 标准复制/粘贴快捷键可直接用。
>
> **VS Code 扩展**：本机复制 → 粘贴同样可用。WebView 使用隐藏的可编辑目标捕获跨域 iframe 内的原生 `paste` 事件（含 `clipboardData.files`），因此**不需要**把工具栏上传当作替代方案。若某个宿主仍阻止文件剪贴板访问，可退回工具栏上传按钮。

#### 从远程桌面复制文件出来

在远程 Windows 中复制文件（例如在资源管理器中），然后点击 RDP 工具栏的**下载**（📥）按钮。远程剪贴板包含文件时按钮自动激活；点击后文件保存到本机**下载**目录。

### 管理连接

所有连接管理复用与桌面版 / CLI 相同的后端和存储：

- **新增连接**：点击视图标题栏的 **+** 按钮（或运行 `aicmd.addConnection`）。打开专用连接编辑 WebView，选择 SSH 或 RDP，填写主机/端口/认证信息并保存。RDP 默认端口 3389、用户名为空；SSH 默认端口 22、用户 `root`。
- **编辑连接**：右键连接 → **编辑**，或运行 `aicmd.editConnection`。打开预填数据的同一编辑器；保存后树自动刷新并关闭编辑器。
- **删除连接**：右键连接 → **删除**，或运行 `aicmd.deleteConnection`。弹出确认对话框；确认后通过后端 API 删除并刷新树。
- **刷新**：点击视图标题栏的 **⟳** 按钮（或运行 `aicmd.refresh`）从后端重新读取连接列表。

> 连接编辑器与桌面应用使用同一个 `ConnectionEditor` 组件，因此 SSH 连接的启动脚本和跳板机 SSH Agent 转发也完整支持。编辑器中的 **「代理设置」** 同样可用：SSH / RDP 均可配置直连、系统代理或自定义 HTTP / HTTPS / SOCKS4 / SOCKS5 代理，详见[代理配置指南](../../docs/proxy.md)。扩展与桌面版共用后端，代理由本机后端服务建立，不受浏览器代理设置影响。

### 配置 AI

1. 在终端 WebView 中点击侧边栏左下角的机器人图标，或 AI 聊天头部的齿轮图标。
2. 输入 API Key 和 Base URL（OpenAI、DeepSeek、通义千问或任意兼容端点）。
3. 选择模型（默认 `gpt-4o-mini`）并保存。
4. 现在可以用自然语言与 AI Agent 对话——它观察终端输出、执行命令并迭代直到任务完成。

### 文件下载（sz / ZMODEM）

当终端会话触发文件下载（例如 `sz file`）时，WebView 向扩展宿主发送保存请求。VS Code 显示原生**另存为**对话框，选择目标位置后文件写入磁盘。

### 停止后端

后端子进程按需启动，当所有 AICmd WebView 面板关闭（且没有编辑器面板打开）时**自动停止**；扩展停用时也会停止。若后端意外崩溃，所有面板关闭并显示错误通知；重新打开连接即可重启。

## 设置

打开 **设置 → 扩展 → AICmd**（或写入 `settings.json`）：

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `aicmd.dataDir` | string | `~/.aicmd` | 连接 / 会话 / AI 配置 / 审计日志的数据目录。留空则复用桌面版 / CLI 的 `~/.aicmd`。 |
| `aicmd.startPort` | number | `9802` | 在 VS Code 内启动 AICmd 服务使用的起始端口；被占用时自动向后寻找可用端口。 |

> 修改 `aicmd.dataDir` 或 `aicmd.startPort` 需要重新加载 VS Code 窗口才生效（会弹出提示）。

## 环境变量

- `AICMD_NODE`：用于启动后端的 `node` 可执行文件路径。默认优先使用 VS Code 宿主运行时（Electron），再回退到 nvm / Homebrew / 系统 Node。仅自动检测失败时才设置。
- `AICMD_DATA_DIR`：覆盖连接 / 会话 / AI 配置 / 审计日志的数据目录（默认 `~/.aicmd`）。优先级高于 `aicmd.dataDir` 设置。
- `AICMD_AUTH_DISABLED`：设为 `1` 可禁用本地令牌认证（很少需要）。

> 本地 Shell 条目使用特殊连接 id `__local__`，使后端直接启动本地终端会话。

## 本地开发

```bash
# 1. 安装依赖（确保 node-pty 针对本地 Node 编译）
pnpm install

# 2. 构建前端 + 后端（生成 dist/）
pnpm build-only

# 3. 安装扩展自身的构建依赖并编译扩展宿主
cd packages/vscode
npm install        # 安装 esbuild / @types/vscode / vsce
npm run compile    # 或 `npm run watch` 持续重编译
cd ../..

# 4. 在 VS Code 中按 F5 启动“扩展开发宿主”
```

F5 启动会使用 `preLaunchTask` 自动运行 `pnpm build:vscode`（前端 + 后端 + 扩展宿主一起构建）。

## 打包与发布

```bash
pnpm build:vscode      # 构建前端 + 后端 + 扩展宿主
node scripts/prepare-vscode-runtime.mjs
cd packages/vscode
vsce package           # 生成 .vsix
vsce publish
```

> 发布包必须包含运行时（`server.js`、含 `rdp_client_bg.wasm` 的 `dist/`、`data/skills`，以及带原生 `node-pty` 的 `node_modules`）。插件市场 / Open VSX 由 CI 构建：先运行 `node scripts/prepare-vscode-runtime.mjs` 把运行时复制到 `packages/vscode/runtime/`，再打包。本地手动打包也需先运行该脚本；存在该目录时扩展会优先使用它。

## 注意事项

- 后端只监听 `127.0.0.1`，WebView 从同源加载前端，因此没有网络暴露，也不需要令牌。
- RDP 目标地址始终取自已保存的连接配置，绝不信任浏览器客户端——恶意页面无法把隧道重定向到任意主机。
- 后端日志写入 **输出** 面板 → **AICmd** 频道，便于排查启动问题。
- WebView 自动跟随 VS Code 颜色主题（浅色 / 深色 / 高对比度）；界面语言跟随 VS Code / CodeBuddy 的界面语言（也可在侧边栏手动切换）。

## 支持与反馈

- 问题：插件市场页面上的 **Q&A** 标签页。
- Bug 与功能请求：[GitHub Issues](https://github.com/fefeding/ai-cmd/issues)。
- 完整中文文档：[README.zh.md](https://github.com/fefeding/ai-cmd/blob/main/README.zh.md)。

---

## English Documentation

# AICmd — AI SSH / RDP Terminal, Remote Desktop & Agent for VS Code

**One extension for AI-powered SSH terminals, Windows remote desktops, and local shells — right inside VS Code.** Connect to servers via SSH, open a graphical Windows desktop via RDP, let an AI agent run commands and analyze logs in natural language, transfer files (SFTP / ZMODEM / RDP clipboard), audit every command, and run batch jobs — without leaving your editor.

[GitHub repository](https://github.com/fefeding/ai-cmd) · [Report an issue](https://github.com/fefeding/ai-cmd/issues)

## Features

| | |
|---|---|
| **SSH & local terminal** | Full xterm.js terminal (256 colors, tabs, auto-reconnect) over `ssh2` / `node-pty` |
| **Windows remote desktop (RDP)** | Graphical desktop via in-browser IronRDP-WASM — **no guacd, no local RDP client, no third-party software on the target**. Mouse/keyboard, fullscreen, clipboard sync and file transfer. |
| **AI Agent** | OpenAI-compatible function calling (OpenAI / DeepSeek / Qwen / any compatible endpoint): the agent reads terminal output, executes commands and iterates until the task is done |
| **Skills** | Built-in ops playbooks plus your own `/skill` markdown playbooks |
| **File transfer** | SFTP upload / download, `rz` / `sz` ZMODEM with a native Save As dialog, and RDP CLIPRDR file copy — copy files locally and `Ctrl/Cmd + V` into the remote desktop, or use the toolbar upload / download buttons |
| **Command audit & replay** | Every AI-executed command is recorded with output, duration and status; timeline, statistics and JSON / CSV export |
| **Log monitoring** | `tail -f` with anomaly detection and AI-powered analysis |
| **Batch operations** | Run one command on multiple servers in parallel and aggregate the results |
| **Jump host & SSH agent forwarding** | Per-connection startup scripts and automatic local SSH agent detection |

## Quick Start

1. Install the extension (from the Marketplace, or `code --install-extension fefeding.vscode-aicmd`), then click the **AICmd** icon in the Activity Bar.
2. Click **Open Local Shell** for a local terminal, or **+** to add a connection:
   - **SSH**: host, port (22), password / private key → opens a terminal;
   - **Windows Remote Desktop (RDP)**: host, port (3389), username / password → opens a graphical desktop.
   Click a connection in the view to open it.
3. *Optional*: click the robot icon, set an OpenAI-compatible API Key + Base URL, then ask the agent things like *"check disk usage and find the biggest log files"*.

No separate AICmd installation is needed — the distributed extension ships its own front-end and backend, starts the backend on demand on `127.0.0.1`, and stops it when the last panel closes.

## Why AICmd instead of a plain terminal / RDP client?

- **Terminal + desktop + AI ops in one place**: a real remote terminal *and* a Windows graphical desktop *and* an agent that can act on what it sees — no mstsc, no guacd, no copy-pasting output into a chatbot.
- **Lightweight remote desktop**: RDP runs via WebAssembly in the browser; the local service is just a thin byte tunnel. Nothing to install on the target beyond Windows' built-in Remote Desktop.
- **Auditable by default**: every command executed by the AI is recorded, with a timeline, statistics and export for review.
- **Fleet-aware**: batch commands, log monitoring and jump-host / agent-forwarding workflows across multiple servers.
- **Shared configuration**: connections, sessions and AI settings live in `~/.aicmd` and are shared with the standalone desktop / CLI AICmd.

## How It Works

```
VSCode Extension Host
  └─ child process: node server.js --port <random free port>   (reuses project root backend, bound to 127.0.0.1)
        ├─ REST API        /api/**
        ├─ Terminal WS     /ws/terminal   (JSON protocol, ssh2 / node-pty)
        └─ RDP tunnel WS   /ws/rdp        (binary RDCleanPath bytes → Windows:3389)
  └─ WebView (iframe → http://127.0.0.1:<port>/)   (same-origin front-end SPA)
        ├─ SSH / local → xterm.js terminal
        └─ RDP        → IronRDP-WASM (browser-side RDP stack + Canvas render)
```

- The backend runs as a **child process** that reuses the project root's `server.js`, so all features are reused unchanged.
- The WebView loads the front-end through a **same-origin iframe**, so the API / WebSocket are same-origin — no token or CORS handling is needed.
- RDP is implemented with **IronRDP-WASM**: the RDP protocol stack runs inside the browser, and the local server only forwards bytes to the configured Windows host (the client-declared destination is ignored, preventing SSRF). No `guacd` daemon is involved.
- The data directory defaults to `~/.aicmd` (overridable via the `aicmd.dataDir` setting) and is **shared with the standalone desktop / CLI AICmd**.

## Requirements

- VS Code `^1.75.0` or later (Windows / macOS / Linux).
- A published build of the extension already includes its own front-end, backend runtime and RDP WASM module — **no separate AICmd install, no guacd, no RDP client is required**. Only source development needs a locally built project, see [Local Development](#local-development).
- Node.js available to launch the backend. The extension locates a `node` binary automatically (see [Environment Variables](#environment-variables)); you normally do not need to set anything.
- For RDP: the target Windows has **Remote Desktop enabled** and port **3389** reachable. The extension's WASM RDP client handles the rest.

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

After activating the extension, an **AICmd** icon appears in the left Activity Bar. Click it to reveal the **Connections** explorer view, which lists:

- **Open Local Shell** — opens a native local shell (`__local__` connection) inside a VSCode WebView tab.
- **Saved connections** — every connection from `~/.aicmd/connections.json` (shared with the desktop / CLI). SSH connections show a globe icon; **RDP connections show a monitor icon**; local connections show a terminal icon, with the host and username as a description.
- **No connections yet** hint — appears when the connection list is empty; click the **+** button in the view title to add one.

### Open a connection

You can open a terminal or a remote desktop in three ways:

1. **Command Palette**: press `Ctrl/Cmd + Shift + P`, then run **`AICmd: Open Connection (Terminal / Remote Desktop)`** (command id `aicmd.openTerminal`).
2. **Activity Bar → Connections view**: click the **Open Local Shell** entry, or click any connection node to open it (SSH → terminal, RDP → graphical desktop).
3. **Connection node inline action**: hover a connection in the view and click the action icon on the right.

The first launch automatically finds an available port and starts the backend service, then opens the UI in a WebView. Re-opening the same connection appends a number to the tab title (`server 2` / `server 3` …) so multiple sessions stay distinguishable.

### Windows Remote Desktop (RDP)

1. On the target Windows, enable **Settings → System → Remote Desktop → Enable Remote Desktop** and make sure TCP 3389 is reachable.
2. In AICmd, click **+** → connection type **Windows Remote Desktop (RDP)** → fill in host, port (default **3389**), username, password, and domain (for domain accounts; leave blank for local accounts). Screen size defaults to 1280×800 and can be adjusted.
3. Click the connection: a graphical desktop opens in the WebView with mouse/keyboard input and resolution auto-fit.

> CredSSP is enabled by default. The RDP stack runs entirely in the browser via IronRDP-WASM — no guacd daemon and no local RDP client are needed.

#### Clipboard (plain text)

Text clipboard sync is **live**: copy text locally, then press `Ctrl/Cmd + V` inside the remote desktop — the current local clipboard is pushed into the RDP channel at the moment of the paste (not the value captured when the connection opened). Text copied on the remote is written back to the local clipboard automatically. The toolbar **clipboard** button also pushes the current local text on demand.

#### Copying files INTO the remote desktop

File transfer uses the RDP **CLIPRDR** channel. There are three ways to send local files to the remote machine; all of them require a **final paste inside the remote desktop** so the remote can pull the file contents:

| Method | Steps |
|---|---|
| **Copy files locally + paste (recommended)** | Copy files in your OS file manager (Finder / Explorer), click the remote desktop once to focus it, then press `Ctrl/Cmd + V` **inside the remote desktop**. The files are picked up from the native paste event and sent to the remote immediately — one keystroke, no extra dialog. This works in the VSCode extension too (a hidden editable paste target is used inside the WebView so the cross-origin iframe still receives the file clipboard). |
| **Toolbar upload** | Click the **upload** (📤) button in the RDP toolbar, choose one or more files, then press `Ctrl/Cmd + V` **inside the remote desktop** (or right-click → Paste in the target folder) to complete the transfer. A toast reminds you of this step. |
| **Drag & drop** | Drag files from your OS onto the remote desktop canvas, then press `Ctrl/Cmd + V` inside the remote desktop to paste them. |

After a transfer starts, the **file transfer panel** at the bottom of the desktop shows each file's name and status (`等待远程粘贴` → transferred). Large files are streamed in chunks.

> **macOS**: `Cmd + V` is mapped to the remote Windows `Ctrl + V`, so the standard Mac copy/paste shortcuts work as expected.
>
> **VSCode extension**: direct local-copy → paste works here as well. The WebView uses a hidden editable target to capture the native `paste` event (with `clipboardData.files`) inside the cross-origin iframe, so you do **not** need to use the toolbar as a workaround. If a particular host still blocks file clipboard access, the toolbar upload button remains as a fallback.

#### Copying files OUT of the remote desktop

Copy files inside the remote Windows (e.g. in Explorer), then click the **download** (📥) button in the RDP toolbar. The button becomes active as soon as the remote clipboard contains files; clicking it saves them to your local **Downloads** folder.

### Manage connections

All connection management reuses the same backend and storage as the desktop / CLI app:

- **Add connection**: click the **+** button in the view title bar (or run `aicmd.addConnection`). A dedicated connection-editor WebView opens; pick SSH or RDP, fill in host/port/auth and save. RDP defaults to port 3389 and an empty username; SSH defaults to port 22 and `root`.
- **Edit connection**: right-click a connection → **Edit**, or run `aicmd.editConnection`. The same editor WebView opens pre-filled. After saving, the tree refreshes automatically and the editor closes.
- **Delete connection**: right-click a connection → **Delete**, or run `aicmd.deleteConnection`. A confirmation dialog appears; confirming removes the connection via the backend API and refreshes the tree.
- **Refresh**: click the **⟳** button in the view title bar (or run `aicmd.refresh`) to re-read the connection list from the backend.

> The connection editor is the same `ConnectionEditor` component used by the desktop app, so startup scripts and SSH agent forwarding for jump-host workflows are fully supported for SSH connections too. The **Proxy Settings** section is available as well: SSH and RDP connections support direct, system, or custom HTTP / HTTPS / SOCKS4 / SOCKS5 proxies (see [Proxy Guide](../../docs/proxy.md)). The extension shares the desktop backend, so the proxy connection is established by the local server and is independent of browser proxy settings.

### Configure AI

1. In the terminal WebView, click the robot icon (bottom-left sidebar) or the gear icon in the AI chat header.
2. Enter your API Key and Base URL (OpenAI, DeepSeek, Qwen, or any compatible endpoint).
3. Choose a model (default: `gpt-4o-mini`) and save.
4. You can now chat with the AI Agent in natural language — it observes terminal output, runs commands, and iterates until the task is done.

### File download (sz / ZMODEM)

When a terminal session triggers a file download (e.g. `sz file`), the WebView posts a save request to the extension host. VSCode shows a native **Save As** dialog; choose a destination and the file is written to disk.

### Stopping the backend

The backend child process starts on demand and **stops automatically** when all AICmd WebView panels are closed (and no editor panel is open). It also stops when the extension is deactivated. If the backend crashes unexpectedly, all panels close and an error notification is shown; re-open a connection to restart it.

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
node scripts/prepare-vscode-runtime.mjs
cd packages/vscode
vsce package           # produce a .vsix
vsce publish
```

> The distributed package must include the runtime (`server.js`, `dist/` including `rdp_client_bg.wasm`, `data/skills`, and `node_modules` with the native `node-pty`). Marketplace / Open VSX releases are built by CI, which runs `node scripts/prepare-vscode-runtime.mjs` to copy the runtime into `packages/vscode/runtime/` before packaging. For a local manual build, run that script before `vsce package` — the extension automatically prefers that directory when present.

## Notes

- The extension's backend listens only on `127.0.0.1`, and the WebView loads the front-end from the same origin, so no network exposure or token is required.
- RDP targets are always taken from the saved connection config, never from the browser client — a malicious page cannot redirect the tunnel to an arbitrary host.
- Backend logs are written to the **Output** panel → channel **AICmd** for troubleshooting startup issues.
- The WebView follows your VSCode color theme (light / dark / high-contrast) and interface language automatically.

## Support & Feedback

- Questions: the **Q&A** tab on the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=fefeding.vscode-aicmd).
- Bugs & feature requests: [GitHub Issues](https://github.com/fefeding/ai-cmd/issues).
- 中文文档：[README.zh.md](https://github.com/fefeding/ai-cmd/blob/main/README.zh.md)。
