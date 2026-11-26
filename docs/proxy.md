# 连接代理配置指南

AICmd 的所有网络连接都支持独立配置代理：SSH、RDP，以及复用 SSH 通道的 SFTP 文件传输、批量操作和远程日志监控。Web / CLI 服务端、Electron 桌面端和 VS Code 扩展共用同一套连接编辑器与后端实现，因此配置方式完全一致。本地 Shell（`local` 类型）不建立网络连接，无需代理。

## 配置入口

新增或编辑连接时，在连接编辑器可选项区域展开 **「代理设置」** 卡片（默认收起；非直连模式会在收起状态显示当前模式徽标）。编辑器默认只显示连接必填项，代理、平台、启动脚本等可选配置都位于折叠卡片中，必要时向下滚动即可找到。配置完成后可直接点击 **「测试连接」** 验证代理是否可用。**新连接默认选择「系统代理」**；编辑存量连接并保存时也会回填为系统代理。未保存过的存量连接仍按直连处理，避免静默改变已有连接行为。

可选模式：

| 模式 | 说明 |
|------|------|
| **直连** | 不使用代理（需手动选择） |
| **系统代理**（默认） | 自动读取环境变量或操作系统代理设置 |
| **自定义代理** | 手动指定 HTTP / HTTPS / SOCKS4 / SOCKS5 代理 |

## 系统代理

解析优先级：

1. **环境变量**：`ALL_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY`（同名小写变量优先）。这与大多数命令行工具的行为一致，适合 CI、跳板容器或手动指定。
2. **操作系统设置**：当上述环境变量均未设置时，读取系统代理：
   - **macOS**：`scutil --proxy`，依次取 HTTPS → HTTP → SOCKS 代理
   - **Windows**：注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`（`ProxyEnable`、`ProxyServer`、`ProxyOverride`）
   - **Linux / GNOME**：`gsettings org.gnome.system.proxy`（`manual` 模式下的 http / https / socks 配置）

浏览器勾选「使用系统代理」时，使用的正是上述系统设置，因此该场景会自动生效。但浏览器**扩展级代理**（如 SwitchyOmega）或启动参数 `--proxy-server` 只影响浏览器到本机服务端的流量，Node 服务端无法感知；这类场景请使用「自定义代理」。

**绕过规则**：`NO_PROXY` 环境变量与系统绕过列表会合并生效（macOS `ExceptionsList`、Windows `ProxyOverride` 含 `<local>`、GNOME `ignore-hosts`）。支持 `*.example.com`、`.example.com`、`host:port`、IPv4 CIDR（如 `192.168.0.0/16`）和 `*`。

系统代理读取结果缓存 3 秒，避免每次连接都 fork 系统命令；系统命令不可用时会静默回退到直连。

## 自定义代理

| 类型 | 协议细节 | 认证 | 默认端口 |
|------|----------|------|----------|
| HTTP | HTTP `CONNECT` 隧道 | Basic（`Proxy-Authorization`） | 80 |
| HTTPS | 到代理本身建立 TLS，再发 `CONNECT` | Basic | 443 |
| SOCKS5 | RFC 1929 握手 + `CONNECT` | 用户名 / 密码可选 | 1080 |
| SOCKS4 / 4a | SOCKS4 请求；域名使用 4a 扩展 | 仅用户名 | 1080 |

填写代理地址、端口，按需填写用户名和密码。代理密码与 SSH 密码使用相同的加密机制保存在 `~/.aicmd/connections.json`（文件权限 `0600`）；编辑连接时密码留空会保留原值，不会覆盖。

> **HTTPS 代理采用宽松策略**：先尝试与代理建立 TLS，握手失败时自动降级为明文 HTTP `CONNECT`（探测超时 3 秒，不会等满连接超时）。因此 `https_proxy=https://127.0.0.1:17891` 这类「值为 https://、实际是 Mixed/HTTP 端口」的配置也能正常工作。系统代理设置里的「HTTPS 代理」项按 HTTP 代理处理，因为它是「用于 HTTPS 流量的代理」而非「需要 TLS 的代理」。也可直接选 **HTTP** 或 **SOCKS5** 跳过探测。

> RDP 通过代理连接时，代理必须允许 `CONNECT` 到目标端口（默认 3389），即需要支持任意 TCP 隧道，纯 HTTP 转发代理不适用。

## 常见问题

**报错 `Client network socket disconnected before secure TLS connection was established`？**
代理端口不接受 TLS（本地代理软件的 Mixed / HTTP 端口常见）。当前版本会自动降级为明文 `CONNECT`，一般无需手动处理；若仍失败，请把代理类型改为 **HTTP** 或 **SOCKS5**。日志里出现「TLS 握手失败，降级为明文 CONNECT」属于正常的自动回退。

**浏览器已经配置了代理，为什么连接不生效？**
若使用的是系统代理，确认系统设置或 `*_PROXY` 环境变量中确实存在该代理；若是浏览器插件/启动参数指定的代理，服务端读不到，请改为「自定义代理」。

**修改系统代理后多久生效？**
最多 3 秒（缓存期）。也可在连接编辑器中重新测试连接。

**VS Code 扩展里能用吗？**
能。扩展复用同一个连接编辑器和后端服务。开发态（F5）从仓库根目录加载最新 `dist/server`；发布态需要重新生成随 vsix 分发的后端 runtime（执行 `npm run build:vscode`，其中包含 `scripts/prepare-vscode-runtime.mjs`）。旧版已安装的扩展需要升级到包含该改动的版本。

**`docs/deployment.md` 中的「反向代理」和这里一样吗？**
不一样。部署文档中的反向代理指浏览器访问 AICmd Web 服务的**入站**入口；本指南的代理指 AICmd 服务端连接 SSH / RDP 目标机的**出站**通道。
