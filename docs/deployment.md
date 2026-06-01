# 部署指南

## 部署方式概览

| 方式 | 适用场景 | 复杂度 |
|------|---------|--------|
| **npm 全局安装** | 个人使用、快速体验 | ★☆☆ |
| **Docker** | 服务器部署、团队共享 | ★★☆ |
| **源码构建** | 开发、定制 | ★★☆ |
| **Electron 桌面应用** | 桌面端用户 | ★☆☆ |
| **GitHub Actions CI/CD** | 自动化发布 | ★★☆ |

## 1. npm 全局安装

```bash
# 安装
npm install -g @fefeding/aicmd

# 启动（默认端口 9802，自动寻找可用端口）
aicmd start

# 自定义端口
aicmd start --port 3000

# 管理
aicmd stop       # 停止
aicmd restart    # 重启
aicmd -v         # 查看版本
```

启动后在浏览器中打开 `http://localhost:9802`。

### 环境要求

- Node.js >= 18
- 原生模块（node-pty、ssh2）需要编译工具：
  - **Linux**: `apt-get install python3 make g++`
  - **macOS**: `xcode-select --install`
  - **Windows**: `npm install --global windows-build-tools`

## 2. Docker 部署

### 快速启动

```bash
# 构建镜像
docker build -t aicmd .

# 运行容器
docker run -d \
  --name aicmd \
  -p 9802:9802 \
  -v ~/.aicmd:/root/.aicmd \
  aicmd
```

### Docker Compose

```yaml
version: '3.8'
services:
  aicmd:
    build: .
    ports:
      - "9802:9802"
    volumes:
      - aicmd-data:/root/.aicmd
    restart: unless-stopped

volumes:
  aicmd-data:
```

```bash
docker-compose up -d
```

### Dockerfile 说明

项目使用多阶段构建：

1. **构建阶段**：基于 `node:22-alpine`，安装编译工具 + pnpm，执行 `pnpm install` 和 `pnpm build`
2. **生产阶段**：基于 `node:22-alpine`，仅复制构建产物和运行时依赖，执行 `pnpm prune --prod` 清理开发依赖

数据持久化在 `/root/.aicmd`，通过 volume 挂载保留。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务监听端口 | `9802` |
| `AICMD_DATA_DIR` | 自定义数据存储目录 | `~/.aicmd` |
| `OPENAI_API_KEY` | AI API 密钥 | - |
| `API_URL` | 自定义 AI 服务地址 | - |

## 3. 源码构建

```bash
# 克隆
git clone https://github.com/fefeding/ai-cmd.git
cd ai-cmd

# 安装依赖
pnpm install

# 开发模式（热重载，端口 9801）
pnpm dev

# 生产构建
pnpm build          # 前端 + 服务端 TypeScript 编译
pnpm build-server   # 仅服务端

# 启动生产模式
node server.js --port 3000
```

## 4. Electron 桌面应用

### 从源码构建

```bash
# 开发模式（热重载）
pnpm electron:dev

# 构建安装包
pnpm electron:build          # 当前平台
pnpm electron:build:win      # Windows → NSIS 安装包 (.exe)
pnpm electron:build:mac      # macOS → DMG (x64 + arm64)
pnpm electron:build:linux    # Linux → AppImage
```

构建产物在 `release/` 目录。

### 构建要求

| 平台 | 要求 |
|------|------|
| Windows | Visual Studio Build Tools（C++ 工作负载） |
| macOS | Xcode Command Line Tools |
| Linux | `python3`, `make`, `g++`, `rpm`, `fakeroot` |

原生模块（`node-pty`, `ssh2`, `cpu-features`）需要 C++ 编译工具来为 Electron 重新编译。

### 镜像加速（中国用户）

构建脚本已内置 npmmirror 镜像：

```javascript
// scripts/electron-build.js
process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';
```

如需自定义镜像，在构建前设置环境变量：

```bash
export ELECTRON_MIRROR=https://your-mirror.com/electron/
pnpm electron:build
```

## 5. GitHub Actions CI/CD

项目配置了 GitHub Actions 自动化构建工作流（`.github/workflows/build.yml`）。

### 触发方式

**自动触发**（推送版本标签）：

```bash
git tag v0.1.6
git push origin v0.1.6
```

**手动触发**：在 GitHub 仓库 → Actions → Build & Release → Run workflow，可选择构建平台。

### 构建矩阵

| Job | Runner | 产物 |
|-----|--------|------|
| `build-windows` | `windows-latest` | `.exe` (NSIS) |
| `build-macos` | `macos-latest` | `.dmg` (x64 + arm64) |
| `build-linux` | `ubuntu-latest` | `.AppImage` |

### 构建流程

每个平台的 Job 执行以下步骤：

1. Checkout 代码
2. Setup Node.js 20 + pnpm
3. 安装系统依赖（Linux: rpm, fakeroot）
4. `pnpm install` 安装项目依赖
5. `node scripts/electron-build.js --platform=<platform>` 构建
6. 上传安装包到 GitHub Release

### CI 与本地构建的差异

| 特性 | CI | 本地 |
|------|-----|------|
| `npmRebuild` | `true`（Runner 有编译工具） | `false`（避免无工具时报错） |
| 原生模块 | 全部 rebuild for Electron | 使用 pnpm 预编译的二进制 |
| 镜像源 | 内置 npmmirror | 内置 npmmirror |

### 发布流程

1. 更新 `package.json` 中的 `version`
2. 创建并推送版本标签：
   ```bash
   npm version patch  # 或 minor / major
   git push origin main --tags
   ```
3. GitHub Actions 自动构建并创建 Release
4. 在 Release 页面填写更新说明

## 数据存储

所有数据存储在本地，不依赖外部数据库：

```
~/.aicmd/
├── connections.json    # SSH 连接配置
├── sessions.json       # 终端会话状态
├── ai-config.json      # AI 配置（API Key、模型等）
├── ai-history/         # 聊天历史
├── audit/              # 审计日志（按日分文件）
│   └── 2025-06-01.jsonl
├── skills/             # 用户自定义技能
│   └── my-deploy.md
└── .trash/             # 回收站
```

使用 `AICMD_DATA_DIR` 环境变量可覆盖默认路径：

```bash
AICMD_DATA_DIR=/data/aicmd node server.js
```

## 反向代理

### Nginx

```nginx
server {
    listen 80;
    server_name aicmd.example.com;

    location / {
        proxy_pass http://127.0.0.1:9802;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**注意**：必须配置 WebSocket 升级（`Upgrade` + `Connection` 头），否则终端和 AI 实时通信无法工作。

## 安全建议

1. **不要暴露到公网**：AICmd 提供完整的终端访问能力，应仅在内网或通过 VPN 访问
2. **配置防火墙**：仅允许信任的 IP 访问 9802 端口
3. **使用反向代理 + HTTPS**：通过 Nginx/Caddy 配置 TLS 加密
4. **定期更新**：关注安全更新，及时升级版本
