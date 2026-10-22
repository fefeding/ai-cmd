# Changelog

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
