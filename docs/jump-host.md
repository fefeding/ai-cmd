# 跳板机与 SSH Agent 转发配置指南

## 概述

AICmd 支持通过跳板机（Jump Host / Bastion Host）访问内网服务器。核心机制：

1. **启动脚本（Startup Script）**：SSH 登录跳板机后自动执行跳转命令
2. **SSH Agent 转发**：将本机密钥代理转发到跳板机，支持二次 SSH 的密钥认证

```
本机 ──SSH──▶ 跳板机 ──SSH──▶ 目标服务器
  │              │                │
  │  SSH Agent   │  Agent 转发    │  使用本机密钥
  │  (持有密钥)   │  (代理通道)    │  完成认证
```

## 配置步骤

### 1. 创建跳板机连接

在连接编辑器中配置跳板机的 SSH 信息：

| 字段 | 值 |
|------|-----|
| 名称 | 如 `跳板机 → 生产服务器` |
| 主机 | 跳板机的公网 IP 或域名 |
| 端口 | 22（或自定义端口） |
| 用户名 | 跳板机的登录用户名 |
| 认证方式 | 密钥 / 密码 / 自动 |

### 2. 配置启动脚本

展开 **「启动脚本」** 卡片，在文本框中填入跳转到目标服务器的命令：

```bash
ssh ubuntu@192.168.1.100
```

如果需要指定端口或用户：

```bash
ssh -p 2222 admin@target-server.internal
```

如果跳板机有首次登录提示（MOTD），脚本会在 800ms 延迟后执行，确保提示显示完毕。

### 3. 启用 SSH Agent 转发

勾选 **「SSH Agent 转发」** 复选框。

这会将本机的 SSH Agent 转发到跳板机，使得在跳板机上执行 `ssh 目标服务器` 时，可以使用本机的密钥进行认证 — **无需将私钥存放在跳板机上**。

## SSH Agent 设置

SSH Agent 转发依赖本机的 ssh-agent 服务。请根据你的操作系统进行配置：

### Linux / macOS

大多数系统默认运行 ssh-agent。确认 Agent 是否工作：

```bash
# 检查 Agent 是否运行
echo $SSH_AUTH_SOCK
# 如果有输出，说明 Agent 正在运行

# 添加密钥到 Agent
ssh-add ~/.ssh/id_rsa
# 如果密钥有密码，会提示输入

# 查看已加载的密钥
ssh-add -l
```

如果 Agent 未运行：

```bash
# 启动 Agent 并设置环境变量
eval $(ssh-agent -s)
ssh-add ~/.ssh/id_rsa
```

**macOS 用户**：将密钥添加到 Keychain 以避免每次重启后重新添加：

```bash
ssh-add --apple-use-keychain ~/.ssh/id_rsa
```

### Windows

Windows 的 OpenSSH Agent 服务默认是**禁用**状态，需要手动启用。

**以管理员身份打开 PowerShell**：

```powershell
# 1. 启动 SSH Agent 服务
Start-Service ssh-agent

# 2. 设为自动启动（重启后仍然可用）
Set-Service ssh-agent -StartupType Automatic

# 3. 添加密钥
ssh-add $HOME\.ssh\id_rsa

# 4. 验证
ssh-add -l
```

如果 `Start-Service` 报错，可能需要先安装 OpenSSH：

```powershell
# Windows 10/11 自带 OpenSSH，如果缺失可通过设置安装：
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

## 工作原理

### 启动脚本执行流程

```
1. AICmd 通过 ssh2 连接到跳板机
2. 建立 Shell 通道
3. 等待 800ms（让 MOTD 显示完毕）
4. 将启动脚本写入 Shell 输入流
5. 跳板机执行脚本，SSH 跳转到目标服务器
6. 终端现在显示目标服务器的 Shell
```

### Agent 转发认证流程

```
1. 本机 ssh-agent 持有私钥
2. SSH 连接跳板机时，agent 通道被转发
3. 启动脚本执行 ssh 目标服务器
4. 目标服务器要求密钥认证
5. 跳板机通过转发通道请求本机 Agent 签名
6. 本机 Agent 用私钥签名，认证通过
```

### 系统信息采集

对于配置了启动脚本的跳板机会话：

- **不会**自动捕获 MOTD（因为二次 SSH 过程中的输出不可靠）
- 当 AI 需要系统信息时，**主动**向目标服务器发送采集命令
- 确保获取的是**目标服务器**的信息（而非跳板机）
- 采集结果会被缓存，避免重复执行

## 常见问题

### Q: 启动脚本执行后提示 "Permission denied"

说明 SSH Agent 转发没有生效。检查：

1. 是否勾选了「SSH Agent 转发」
2. 本机 ssh-agent 是否在运行（`ssh-add -l`）
3. 密钥是否已添加到 Agent
4. Windows 用户：OpenSSH Agent 服务是否已启动

### Q: 启动脚本没有执行

可能原因：
- 跳板机的 MOTD 输出过多，覆盖了脚本输入
- 网络延迟导致 800ms 不够
- 可以在脚本前加一行 `sleep 1` 延迟

### Q: 可以使用密码认证进行二次 SSH 跳转吗？

可以，但不推荐。在启动脚本中使用 `sshpass`：

```bash
sshpass -p 'password' ssh user@target-server
```

**风险**：密码会出现在进程列表中。推荐使用密钥 + Agent 转发。

### Q: 多级跳板机（跳板机 → 跳板机 → 目标）是否支持？

支持。在启动脚本中链式跳转：

```bash
ssh -J jump2.internal target.internal
```

或使用 `-J`（Jump）参数指定多级跳转，SSH 会自动处理链路。确保 Agent 转发已启用，密钥在所有节点都能通过转发认证。

## 安全建议

1. **始终使用 Agent 转发**，不要将私钥复制到跳板机
2. **限制跳板机权限**：跳板机只开放 SSH 端口，不运行其他服务
3. **定期轮换密钥**：即使使用 Agent 转发，也应定期更新 SSH 密钥
4. **审计日志**：AICmd 会记录所有 AI 执行的命令，可在审计面板中查看
