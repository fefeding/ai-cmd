# fTerm

Web SSH 远程终端工具，支持 rz/sz 文件传输。

## 特性

- **Web SSH 终端**：基于 xterm.js 的高性能终端体验
- **本地 Shell 支持**：通过 node-pty 提供原生本地 Shell 访问
- **文件传输**：支持 rz/sz (ZMODEM) 文件上传下载
- **多会话管理**：支持同时管理多个 SSH/本地 Shell 会话
- **连接管理**：可视化的连接配置管理（增删改查）
- **桌面应用**：支持 NW.js 打包为跨平台桌面客户端

## 技术栈

- **前端**：Vue 3 + TypeScript + Vite + Bootstrap 5 + xterm.js
- **后端**：Node.js + Express + WebSocket (ws)
- **SSH/PTY**：ssh2 + node-pty
- **构建工具**：Vite + TypeScript + nw-builder

## 快速开始

### 安装

```bash
npm install -g @fefeding/fterm
# 或
pnpm add -g @fefeding/fterm
```

### 环境要求

- Node.js >= 18
- pnpm

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

启动后访问 http://localhost:9801

### 构建

```bash
# 构建前端 + 服务端
pnpm build

# 仅构建前端
pnpm run build-only
```

### 启动生产服务

全局安装后，使用 `fterm` CLI 命令：

```bash
# 启动服务（默认端口 9802）
sudo fterm start

# 停止服务
fterm stop

# 重启服务
fterm restart

# 查看版本
fterm -v
```

也可以直接通过 Node.js 启动：

```bash
node server.js
```

或者在项目目录下使用 npm 脚本管理：

```bash
# 启动服务
npm start

# 停止服务
npm stop

# 重启服务
npm restart
```

默认端口 9802，可通过 `--port` 或 `PORT` 环境变量指定：

```bash
node server.js --port 3000
```

### 桌面应用（NW.js）

```bash
# 开发模式
pnpm nw:dev

# 构建各平台
pnpm nw:build        # 当前平台
pnpm nw:build:win    # Windows
pnpm nw:build:osx    # macOS
pnpm nw:build:linux  # Linux
```

## 项目结构

```
.
├── bin/              # CLI 入口
├── dist/             # 构建产物
├── public/           # 静态资源
├── scripts/          # 构建脚本
├── server/           # 服务端源码（TypeScript）
│   ├── model/        # 实体定义
│   ├── service/      # 业务逻辑
│   └── index.ts      # 服务端入口
├── src/              # 前端源码
│   ├── adapter/      # 数据适配层
│   ├── base/         # 基础模块
│   ├── components/   # Vue 组件
│   ├── platform/     # 平台入口
│   ├── service/      # 前端服务
│   ├── stores/       # Pinia 状态管理
│   ├── utils/        # 工具函数
│   └── views/        # 页面视图
├── view/             # HTML 模板
└── server.js         # 生产环境启动脚本
```

## 开发说明

### 服务端开发

服务端代码位于 `server/` 目录，使用 TypeScript 编写。开发模式下 Vite 直接引用源码，无需手动编译。

### 前端开发

前端使用 Vue 3 Composition API + Pinia 进行状态管理，UI 框架为 Bootstrap 5。

### 连接配置

连接信息持久化存储在服务端本地文件中。

## 许可证

MIT
