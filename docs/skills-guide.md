# 自定义技能（Skills）开发指南

## 什么是 Skill？

Skill 是 AI Agent 的「操作手册」。它是一个 Markdown 文件，告诉 Agent 遇到某类任务时应该怎么做 — 包括执行步骤、注意事项、最佳实践等。

Skill 被注入到 Agent 的系统提示词中，让 AI 不需要每次从零开始思考，而是遵循预定义的 SOP。

## 快速开始

### 1. 创建技能文件

在用户技能目录下创建 Markdown 文件：

```bash
# Linux / macOS
mkdir -p ~/.aicmd/skills
touch ~/.aicmd/skills/my-deploy.md

# Windows
mkdir %USERPROFILE%\.aicmd\skills
echo. > %USERPROFILE%\.aicmd\skills\my-deploy.md
```

### 2. 编写技能内容

```markdown
---
name: Deploy My App
description: Deploy the production application with zero-downtime
tags: [deploy, ops, production]
---

Deploy the application following these steps:

1. Pull the latest code from the main branch
2. Run database migrations
3. Build frontend assets
4. Restart the application with PM2 (graceful reload)
5. Verify the deployment by checking the health endpoint

## Important Notes

- Always check the current deployment status before starting
- If any step fails, rollback to the previous version
- Run `pm2 logs` after deployment to check for startup errors
```

### 3. 使用技能

在 AI 聊天中用斜杠命令触发：

```
/deploy-my-app
```

或者直接用自然语言（Agent 会根据 tags 自动匹配）：

```
帮我部署一下应用
```

## 文件格式

### Front Matter（元数据）

每个 Skill 文件以 YAML front matter 开头：

```yaml
---
name: 技能名称           # 必填，显示名称
description: 简短描述     # 必填，Agent 据此判断何时使用此技能
tags: [tag1, tag2]       # 必填，用于搜索和自动匹配
---
```

| 字段 | 说明 | 要求 |
|------|------|------|
| `name` | 技能的显示名称 | 必填，简洁明了 |
| `description` | 一句话描述技能用途 | 必填，Agent 据此决定是否匹配 |
| `tags` | 标签列表 | 必填，用于关键词匹配 |

### Markdown 正文

Front matter 之后的 Markdown 内容是技能的核心指令，会被注入到 Agent 的系统提示词中。

## 编写最佳实践

### 1. 明确执行策略

告诉 Agent **怎么做**，而不只是**做什么**：

```markdown
## Execution Strategy

Use a bash script to collect all metrics in one pass.
For Windows targets, generate a PowerShell script instead.
```

### 2. 区分平台差异

如果技能涉及系统命令，说明不同平台的差异：

```markdown
## Platform Notes

- **Linux**: Use `systemctl` for service management
- **macOS**: Use `launchctl` instead, no `systemctl` available
- **Windows**: Use PowerShell cmdlets like `Get-Service`, `Stop-Service`
```

### 3. 指定何时用脚本 vs 单条命令

```markdown
## When to Generate Scripts

Generate a script (instead of running commands one by one) when:
- The task has more than 3 sequential steps
- Requires loops, conditionals, or error handling
- Needs to process large amounts of data

For simple single-step operations, a direct command is fine.
```

### 4. 包含安全检查

```markdown
## Safety

- Always preview destructive operations before executing
- For database operations, create a backup first
- Never run `DROP DATABASE` without explicit user confirmation
```

### 5. 定义输出格式

```markdown
## Output Format

Present results as a structured report:
1. Summary line (one sentence)
2. Key metrics in a table
3. Issues highlighted with ⚠️
4. Recommendations at the end
```

## 技能来源与优先级

```
系统内置 Skills:  <project>/data/skills/*.md   ← 随项目发布
用户自定义 Skills: ~/.aicmd/skills/*.md          ← 用户私有
```

**优先级规则**：用户自定义 Skills 优先级高于系统内置。如果两者同名（文件名相同），用户版本会覆盖系统版本。

## 内置技能参考

### server-health-check

全面的服务器健康检查：CPU、内存、磁盘、网络、进程、服务状态。跨平台自适应。

```yaml
name: Server Health Check
description: Comprehensive server health check - CPU, memory, disk, network, processes, services
tags: [ops, monitoring, health]
```

### log-analyze

日志分析：错误模式检测、频率统计、异常关联分析。支持 Python/awk 脚本。

```yaml
name: Log Analysis
description: Analyze log files for errors, patterns, and anomalies
tags: [ops, logs, analysis]
```

### docker-manage

Docker 管理：容器生命周期、镜像清理、网络排查、卷管理。

```yaml
name: Docker Management
description: Docker container lifecycle management, cleanup, monitoring
tags: [ops, docker, containers]
```

## 技能触发方式

| 方式 | 示例 | 说明 |
|------|------|------|
| **斜杠命令** | `/docker-manage` | 用户显式指定，精确触发 |
| **关键词匹配** | "帮我看看 docker 状态" | 基于 tags 自动匹配 |
| **LLM 智能分析** | 复杂任务描述 | Agent 阅读所有 Skill 描述后选择最佳匹配 |

## 调试技巧

1. **检查技能是否被加载**：查看服务端启动日志中的 `[SkillService] Loaded N skills`
2. **验证触发**：在聊天中输入 `/your-skill-name`，观察 Agent 是否按照技能指令行动
3. **迭代优化**：修改技能文件后，重启服务即可生效（无需重新构建）
4. **查看系统提示词**：开启 DevTools 的 Network 面板，观察发送给 AI 的完整提示词

## 示例：完整的 Nginx 管理技能

```markdown
---
name: Nginx Management
description: Manage Nginx web server - config, reload, SSL, troubleshooting
tags: [ops, nginx, web, ssl]
---

Manage Nginx web server configuration and troubleshooting.

## Pre-check

Before any operation, verify Nginx is installed:
```bash
nginx -v 2>&1 || echo "Nginx not installed"
```

## Common Operations

### Config Validation (ALWAYS do this before reload)
```bash
nginx -t
```

### Reload Config (graceful, no downtime)
```bash
systemctl reload nginx   # Linux
launchctl kickstart -k system/org.macports.nginx  # macOS (MacPorts)
```

### View Current Config
```bash
cat /etc/nginx/nginx.conf
ls /etc/nginx/sites-enabled/   # Debian/Ubuntu
ls /etc/nginx/conf.d/          # CentOS/RHEL
```

### SSL Certificate Check
```bash
echo | openssl s_client -connect localhost:443 -servername $(hostname) 2>/dev/null | openssl x509 -noout -dates
```

## Troubleshooting

### 502 Bad Gateway
1. Check upstream service: `systemctl status <upstream>`
2. Check Nginx error log: `tail -50 /var/log/nginx/error.log`
3. Verify upstream port is listening: `ss -tlnp | grep <port>`

### High Memory/CPU
1. Check worker processes: `ps aux | grep nginx`
2. Review worker_connections in config
3. Check for open file descriptor limits: `cat /proc/sys/fs/file-max`

## Safety

- ALWAYS run `nginx -t` before reload
- Backup config before major changes: `cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak`
- For SSL changes, test with `curl -vk https://localhost` first
```

## 技术细节

- **文件编码**：UTF-8
- **行尾**：LF（Unix）或 CRLF（Windows）均可
- **文件大小**：建议不超过 10KB（过大的内容会占用过多上下文窗口）
- **热加载**：修改技能文件后需重启 AICmd 服务
- **存储位置**：技能文件路径由 `AICMD_DATA_DIR` 环境变量控制（默认 `~/.aicmd/skills/`）
