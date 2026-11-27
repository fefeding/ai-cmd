# Changelog

## 1.1.3

- 声明 `extensionKind: ["ui"]`：扩展固定运行在本机扩展宿主，Remote-SSH / WSL 窗口下后端与 WebView 同源地址保持一致。
- 「在终端执行选中内容」按当前面板上报的 `sessionId` 精确写入，修复同一连接多标签时命令发到其它终端的问题。
- RDP 全屏改为按面板汇总期望状态、只在状态跳变时切换窗口，并随面板关闭自动退出；修复多面板相互抵消与全屏残留。
- CI 增加扩展宿主类型检查与 VSIX 内容校验（后端、MCP 入口、RDP WASM、六平台 node-pty 预编译），避免缺件包发布。
- 修正 README 安装命令的文件名；环境变量白名单放行文档声明的 `AICMD_AUTH_DISABLED`。
- 改进 TCP / TLS / 代理连接失败时的错误信息：展开 `AggregateError` 的候选错误码，避免空消息难以排查。

## 1.1.2

- 「添加到 AI 对话」改为随引用携带会话通道信息与一次性桥接命令（`mcp.js --call`），不再写入用户级 MCP 配置；解绑后自动失效，兼容 CodeBuddy / Trae / 通义灵码 / 原生 VSCode 等宿主。
- MCP stdio 入口新增 `--call` 一次性调用模式，供 AI 对话在没有工具注册时直接操作当前绑定终端。
- 移除终端工具栏与右键菜单中的「AI 对话与 MCP 说明」入口及相关文案。

## 1.1.1

- 新增 **AI / MCP 使用说明**：Web 终端工具栏和右键菜单增加 `?` 入口，说明内置 AI 助手与编辑器 AI 对话的区别、原生 VSCode 工具与 MCP 工具名、长输出分页、安全边界和解除绑定方式；插件 README 同步补充完整使用步骤。

## 0.1.35

- 新增 **终端会话添加到 AI 对话并允许 AI 操作机器**：终端右键菜单把当前输出作为 `@Terminal` 上下文塞进对话输入框，同时把会话绑定给 AICmd MCP 工具。AI 可通过 `session_exec` 等在用户可见的终端里执行命令、读取输出和中断；CodeBuddy 自动注册 MCP server，其它编辑器复制 MCP 配置。适配 CodeBuddy、Trae、Cursor、Windsurf，以及原生 VSCode 中激活的 Copilot Chat / Cline / Continue / Roo Code；原生 VSCode 未启动 AI 对话插件时不显示该菜单。

## 0.1.31

- 新增 **SSH 端口转发 / 隧道**：支持本地隧道（`-L`，本机端口 → 远程内网服务，如数据库）与远程转发（`-R`，让公网访问本机服务），连接编辑器可配置多条规则并单独启停、自动启动；隧道面板实时展示状态与活跃连接数。
  - 隧道按「连接 + 规则」共享：同一连接开多个终端标签页或开多个 Web 页面时只启动一条隧道，自动规避监听端口冲突；承载会话关闭时隧道自动交接给其它在线会话，不会凭空消失。
  - 性能优化：关闭 SSH 通道 Nagle 算法、目标不可达时 10s 快速失败并立即回收通道，避免通道残留占用服务端 `MaxSessions` 导致页面资源加载失败。
- 修复 VSCode 侧栏 ▶ 按钮打开终端时连接名称 / 类型丢失的问题：侧栏按钮只传 `TreeItem`（取不到名称与类型），现统一按 id 从连接列表补齐，避免标题退化成「本地 Shell」、RDP 连接被当成 SSH 打开。
- 连接侧栏支持按「分组」或「标签」折叠展示，并可按名称 / 主机 / 用户名 / 分组 / 标签搜索。WEB 侧栏新增分组方式切换，VSCode 连接视图新增 `aicmd.searchConnection` 与 `aicmd.setGroupMode` 命令（分组方式持久化）。
- 新增连接 JSON 导入 / 导出：`aicmd.exportConnections` / `aicmd.importConnections`（WEB 侧栏同样提供按钮）。导出默认剔除密码、私钥和代理密码，适合团队共享；明确选择后可包含凭据用于个人备份。导入按名称覆盖同名连接，重新生成 ID 并重新加密凭据，完成后提示新增 / 覆盖 / 跳过数量。
- 连接编辑器精简：默认只显示名称、类型、主机 / 端口、用户名和认证方式；分组与标签、目标平台、RDP 域与分辨率、启动脚本、端口转发、保活、终端外观、代理设置等可选项折叠展示，已有配置在编辑时自动展开并显示标记。

## 0.1.30

- 修复 RDP 连接失败时错误提示显示为 `{"__wbg_ptr":...}` 的问题：现在会解析 IronRDP-WASM 抛出的 `IronError`，展示可读的错误类型与错误链（如密码错误、登录失败、访问被拒绝、协议协商失败）。

## 0.1.29

- 修复窗口重载后恢复已打开 Tab 时一直空白的问题：恢复逻辑会使用本次实际启动的后端地址重建页面 URL，不再沿用上次会话保存的旧端口；后端启动失败时会在面板内直接显示原因。
- 新增 `onWebviewPanel:aicmd.terminal` 激活事件，确保面板恢复前扩展已激活并注册序列化器。

## 0.1.27

- 新增 **Windows 远程桌面（RDP）** 支持：连接列表中 RDP 类型显示专用显示器图标，点击即可在 WebView 内打开图形桌面，支持鼠标/键盘、分辨率自适应、文本剪贴板同步及 CLIPRDR 文件上传/下载。
  - 采用 **IronRDP-WASM**：RDP 协议栈在浏览器内运行，**无需 guacd 守护进程、无需本机 RDP 客户端、目标 Windows 无需第三方软件**（只需开启系统自带远程桌面 + 3389 端口）。
  - 本地服务端新增 `/ws/rdp` 二进制字节隧道；目标地址一律以保存的连接配置为准（忽略客户端声明，防止 SSRF）。Electron 桌面端通过本机回环代理接入。
  - 连接编辑器中 RDP 默认端口 3389、用户名为空（不再误用 SSH 的 22/root），认证固定为密码 + CredSSP；移除原 guacd 配置项。
  - 文本剪贴板改为**实时同步**：在远程按 `Ctrl/Cmd + V` 时推送当前本地剪贴板内容，而非连接建立时的旧值；macOS 下 `Cmd` 键映射为远程 `Ctrl`，Mac 快捷键正常工作。
  - 文件复制粘贴到远程：支持「本地复制文件 + 在远程 `Ctrl/Cmd + V`」「工具栏上传」「拖拽到画布」三种方式，均经 CLIPRDR 通道分块传输；远程复制的文件可通过下载按钮保存到本地。**VSCode 插件内同样支持直接粘贴**：WebView 通过隐藏可编辑层捕获原生 paste 事件（含 `clipboardData.files`），跨源 iframe 也能拿到本地复制的文件。README 中已补充完整操作步骤。
- 更新扩展名称/描述与 README：插件现定位为「AI SSH / RDP 终端与运维智能体」，中英文 displayName、description、keywords 与市场说明同步覆盖 RDP 能力。

## 0.1.26

- 优化 VS Code Marketplace 展示与可发现性：显示名加入 SSH 关键词、keywords 扩充至 26 个、主分类改为 AI；新增 `galleryBanner` / `homepage` / `bugs` / Q&A / 免费标识；重写 README 首屏（价值主张、功能表、快速上手、差异化对比）并补充支持入口。

## 0.1.25

- 修复终端 `Ctrl/Cmd+V` 粘贴内容重复，并保证任何宿主环境下都**恰好粘贴一次**：
  - 粘贴统一由捕获阶段的 `paste` 监听处理（同步读取 `e.clipboardData`，跨源 WebView 亦可），避免 xterm 默认粘贴与手动桥接各贴一次；
  - 部分宿主会吞掉 `keydown` 的默认粘贴动作导致原生 `paste` 事件不派发，故快捷键分支增加延时兜底：若窗口期内无原生 `paste` 事件到达则经 `readClipboard` 补发一次，两条路径按时间戳互斥去重。
- 修复 AI 对话输出无法复制的问题（右键复制无效）：
  - `copy`/`cut` 事件内改用**同步** `e.clipboardData.setData` 写入剪贴板（原实现只用异步桥接，易静默失败导致剪贴板为空），桥接保留为兜底；
  - AI 对话框自建右键菜单（复制 / 复制消息 / 全选），输入框内额外提供粘贴；触发以 `mousedown`/`mouseup` 为主、`contextmenu` 为辅，兼容不派发 `contextmenu` 的宿主。
- 新增**全局「选中即浮现复制」工具条**：在 AI 输出、AI 设置窗口及所有弹窗中用鼠标选中文字后，选区上方自动浮现「复制」按钮，点击即复制（`navigator.clipboard` 优先，隐藏 textarea + `execCommand` 兜底）。用于替代在部分宿主（如 CodeBuddy WebView）中被吞掉、无法使用的右键复制。
- 修复 WebView 加载旧版前端资源的问题：构建产物文件名为固定 `[name].js`（无内容哈希），WebView 常命中缓存导致改动不生效；现为 HTML 中的 js/css/字体/图片引用统一附加构建时间戳 `?v=` 强制失效缓存。

## 0.1.24

- 扩展名称与说明支持中英文：通过 VSCode NLS 机制，`displayName`/`description` 改为占位符，新增 `package.nls.json`（英文默认）与 `package.nls.zh-cn.json`（简体中文），随 VSCode 界面语言自动切换。

## 0.1.23

- 修复 AI 智能体在 SSH/终端会话中**命令输出被截断、只剩提示符**的问题（更新 `@cicctencent/agent-core` 后尤为明显）：
  - 根因 1：ANSI 清洗正则 `\x1B[^\x1B]*[a-zA-Z]` 贪婪跨正文匹配，会吞掉命令真实输出与提示符主体（如 `whoami` 的 `root`）。改为 `server/utils/ansi.ts` 按 ECMA-48 有界结构清洗。
  - 根因 2：命令结尾用 `\n` 而非伪终端所需的 `\r`，导致 stdout 几乎不回传。已统一为 `\r`，与内部探测命令一致。
  - 根因 3：`engine.run` 未注入 `context.custom.shell`，新版 agent-core 内置 `execute_command`/`read_terminal` 落到 noop shell。已注入真正执行器。
  - 命令采集改为「空闲即停」（输出稳定即返回，最长兜底 10s），更完整且不空等。

## 0.1.22

- 修复更新 `@cicctencent/agent-core` 后终端输出彻底捕不到的问题：
  - 根因：新版 agent-core 内置 `execute_command`/`read_terminal` 走 `ToolContext.shell.exec/read`，宿主须在 `engine.run` 的 `context.custom.shell` 注入真正的执行器；此前未注入，内置工具落到 noop shell（不报错但无输出）。
  - 修复：`agentRun` 注入 `custom.shell`（exec→executeCommand、write→writeData、read→readTerminal），并使 `read_terminal` 优先读取新增的会话输出缓冲（空闲终端也能读到当前屏幕）。

## 0.1.21

- AI 智能体修复：
  - 终端读取截断：`read_terminal` 原仅采集调用后 500ms 新输出且按「末 50 非空行」裁剪，导致只读到最后提示符。改为 1500ms 窗口 + 保留空行 + 末 200 行。
  - 最终结论重复：外部引擎 `done` 事件重发全文，前端又叠加到已流式文本。现按去重逻辑处理（已包含则跳过、超集则替换、否则追加）。

## 0.1.20

- AI 对话体验优化：
  - 新增生成状态/动画：助手消息等待响应时显示跳动圆点、流式输出时显示闪烁光标；头部运行期间显示「生成中...」+ 实时耗时。
  - 新增执行耗时反馈：工具调用进行中显示旋转图标；头部耗时超过 30s 变为红色「执行较慢，可点击停止」提示。

## 0.1.19

- 修复 CodeBuddy 等 VSCode 系宿主下 AI 对话 / AI 配置输入框复制粘贴全失效：宿主会注入 `electronAPI.clipboard`，此前错误的宿主判定会使桥接安装被跳过、且请求命中该无效实现。现统一以「iframe 是否由扩展壳加载」为准判定，宿主 preload 降级为桥接失败后的兜底。

## 0.1.18

- 修复 VSCode WebView 内 AI 配置 / AI 对话等输入框仍无法复制粘贴：跨源 iframe 下浏览器不会派发 `copy`/`paste` 事件，改为直接拦截 `Ctrl/Cmd + C/X/V` 快捷键完成复制/剪切/粘贴（粘贴时按光标插入并派发 `input` 事件更新 `v-model`）。
- 补齐连接编辑页（`vscode-edit.ts`）遗漏安装的剪贴板桥接。

## 0.1.17

- 修复 VSCode 扩展内**所有**输入框（终端、AI 配置、AI 对话、文件管理等）的复制/粘贴：新增全局剪贴板桥接 `installVscodeClipboardBridge`，polyfill `navigator.clipboard` 并拦截原生 `copy`/`cut`/`paste` 事件，统一经扩展 `vscode.env.clipboard` 完成，仅在 VSCode WebView 运行时生效。

## 0.1.16

- 修复 VSCode 扩展内终端（WebView 跨源 iframe）无法复制/粘贴的问题：新增剪贴板桥接，经「iframe → 宿主 WebView → 扩展 `vscode.env.clipboard` → 宿主 WebView → iframe」完成读写。

## 0.1.15

- 修复打包后启动报错「未找到后端构建产物 dist/server/index.js」。
