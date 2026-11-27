import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { isChinese, t } from './i18n';
import type { ServerLauncher } from './server-launcher';

/** 终端页发给扩展宿主的对话上下文（纯扩展侧，不经过后端 MCP）。 */
export interface TerminalChatContext {
  sessionId?: string;
  sessionName?: string;
  connectionId?: string;
  connectionType?: string;
  host?: string;
  username?: string;
  snapshot: string;
  /** 「添加到 AI 对话」时由 MCP 桥接给出的工具使用提示 */
  toolHint?: string;
  /** 宿主支持 vscode.lm.registerTool，原生工具已经注册 */
  nativeTools?: boolean;
}

export type ChatAdapter =
  | 'codebuddy'
  | 'trae'
  | 'workbench-chat'
  | 'clipboard-focus';

/** 扩展宿主探测到的 AI 对话能力；WebView 据此决定是否显示菜单。 */
export interface ChatContextCapability {
  available: boolean;
  adapter?: ChatAdapter;
  /** clipboard-focus 适配器用来聚焦输入框的命令 */
  focusCommand?: string;
  host?: string;
}

const COMMANDS = {
  codebuddy: 'tencentcloud.codingcopilot.codeAction',
  trae: 'workbench.action.chat.icube.open',
  workbenchChat: 'workbench.action.chat.open',
  paste: 'editor.action.clipboardPasteAction',
};

/** 原生 VSCode 中代表「已绑定终端」的单个工具引用（package.json 中声明）。 */
const NATIVE_TOOL_REFERENCE_ID = 'aicmd_sessionInfo';

function vsCodeAtLeast(major: number, minor: number): boolean {
  const [currentMajor, currentMinor] = vscode.version.split('.').map(Number);
  return currentMajor > major || (currentMajor === major && currentMinor >= minor);
}

/** 用连接名生成一个上下文文件，作为原生 VSCode 对话中的引用 chip。 */
function terminalReferenceFile(name: string, target: string): vscode.Uri {
  const safeName = name.replace(/[^\p{L}\p{N}._@-]+/gu, '_').slice(0, 80) || 'AICmd';
  const dir = path.join(os.tmpdir(), 'aicmd-chat');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, safeName);
  const lines = isChinese
    ? [
        `# AICmd 终端：${name}`,
        target ? `- 目标：${target}` : '',
        '- 状态：已绑定到当前对话，工具无需会话 id。',
        '',
        '操作方式：使用对话中已启用的 AICmd 工具。',
        '- aicmd_sessionInfo：查看终端信息',
        '- aicmd_sessionRead：读取当前屏幕',
        '- aicmd_sessionExec：在用户可见终端执行命令（带审计）',
        '- aicmd_sessionOutput：读取被截断的剩余输出',
        '- aicmd_sessionInterrupt：中断命令',
        '- aicmd_sessionDetach：解除绑定',
      ]
    : [
        `# AICmd terminal: ${name}`,
        target ? `- Target: ${target}` : '',
        '- Status: bound to this conversation; tools need no session id.',
        '',
        'Operate it with the AICmd tools enabled in this conversation:',
        '- aicmd_sessionInfo: terminal info',
        '- aicmd_sessionRead: read the current screen',
        '- aicmd_sessionExec: run a command in the visible terminal (audited)',
        '- aicmd_sessionOutput: read remaining truncated output',
        '- aicmd_sessionInterrupt: interrupt the running command',
        '- aicmd_sessionDetach: detach the terminal',
      ];
  fs.writeFileSync(file, lines.filter(Boolean).join('\n'), 'utf8');
  return vscode.Uri.file(file);
}

/** 原生 VSCode 下，只有这些 AI 对话插件激活时才开放入口。 */
const AI_CHAT_EXTENSION_IDS = [
  'github.copilot-chat',
  'saoudrizwan.claude-dev',
  'continue.continue',
  'rooveterinaryinc.roo-cline',
  'anthropic.claude-code',
  'openai.chatgpt',
];
const AI_CHAT_EXTENSION_HINT =
  /(copilot-chat|coding-copilot|codingcopilot|codebuddy|cline|continue|genie|windsurf|codeium|cursor|trae|anthropic|claude|chatgpt)/i;

interface FocusAdapter {
  id: string;
  command: string;
  matches: (extensionId: string) => boolean;
}

const FOCUS_ADAPTERS: FocusAdapter[] = [
  {
    id: 'cline',
    command: 'cline.focusChatInput',
    matches: (id) => id.includes('claude-dev') || id.includes('cline'),
  },
  {
    id: 'continue',
    command: 'continue.focusContinueInput',
    matches: (id) => id.startsWith('continue.'),
  },
  {
    id: 'roo-code',
    command: 'roo-cline.focusInput',
    matches: (id) => id.includes('roo-cline') || id.includes('roo-code'),
  },
];

function hostName(): string {
  const env = vscode.env as any;
  return `${env?.appName || ''} ${env?.appHost || ''}`.toLowerCase();
}

function isForkHost(name: string): boolean {
  return ['codebuddy', 'trae', 'cursor', 'windsurf', 'zcode'].some((token) =>
    name.includes(token)
  );
}

function isOfficialVsCode(name: string): boolean {
  return !isForkHost(name) && (name.includes('visual studio code') || /\bvscode\b/.test(name));
}

function activeAiChatExtensions(): string[] {
  return vscode.extensions.all
    .filter((extension) => {
      const id = extension.id.toLowerCase();
      return (
        extension.isActive &&
        (AI_CHAT_EXTENSION_IDS.includes(id) || AI_CHAT_EXTENSION_HINT.test(id))
      );
    })
    .map((extension) => extension.id.toLowerCase());
}

/**
 * 多编辑器对话上下文桥接（扩展宿主侧）。
 *
 * - CodeBuddy：codeAction + terminal mention，形成真正的 `@Terminal` 上下文项；
 * - Trae：workbench.action.chat.icube.open + terminalPayload；
 * - 原生 VSCode 1.105+：workbench.action.chat.open + attachFiles，把以连接名
 *   命名的上下文文件作为单个引用加入输入框，不自动发送；1.99–1.104 退回工具引用，
 *   更早版本退回预填文本；
 * - Cursor / Windsurf：workbench.action.chat.open，以 isPartialQuery 把文本留在输入框；
 * - Cline / Continue / Roo Code：聚焦各自输入框后粘贴快照，不自动发送。
 *
 * 原生 VSCode 必须有常用 AI 对话插件处于激活状态才开放；桌面 Electron / 浏览器
 * 根本不会加载本扩展。不调用后端 API，不注册 MCP server，也不绑定会话。
 */
/** 后端绑定的会话（与 /api/mcp/bind 返回一致） */
export interface BoundSessionInfo {
  sessionId: string;
  sessionName: string;
  connectionId: string;
  type: string;
  connectionName?: string;
  host?: string;
  username?: string;
  boundAt: number;
}

export type ToolRegistration = 'registered' | 'clipboard' | 'unavailable';

export interface ToolAttachResult {
  bound: BoundSessionInfo;
  registration: ToolRegistration;
}

/**
 * 后端 MCP 工具桥接：把当前终端会话绑定给 AI 对话，并让 AI 编辑器获得
 * session_exec / session_read / session_interrupt 工具。
 *
 * - 新版 VSCode / Copilot 宿主：通过 vscode.lm.registerTool 直接注册原生工具；
 * - CodeBuddy：用内部命令自动注册 MCP server；
 * - 其它编辑器：把 MCP 配置复制到剪贴板，用户一次性粘贴。
 * 三条路径最终都调用后端同一个绑定会话，不存在 sessionId 参数。
 */
const NATIVE_NO_BINDING =
  '没有 AICmd 终端被添加到当前对话。请右键 AICmd 终端 →「添加到 AI 对话」。\n' +
  'No AICmd terminal is attached. Right-click the AICmd terminal and choose "添加到 AI 对话".';

export class McpToolBridge implements vscode.Disposable {
  onChange: ((bound: BoundSessionInfo | null) => void) | undefined;

  /** 官方 VSCode + vscode.lm：工具由扩展直接注册，无需 MCP 配置或剪贴板。 */
  get nativeTools(): boolean {
    return (
      typeof (vscode as any).lm?.registerTool === 'function' &&
      isOfficialVsCode(hostName())
    );
  }

  private bound: BoundSessionInfo | null = null;
  private registered = false;
  private pollTimer: NodeJS.Timeout | undefined;
  private polling = false;
  private readonly indicator: vscode.StatusBarItem;
  private readonly toolDisposables: vscode.Disposable[] = [];

  constructor(private readonly launcher: ServerLauncher) {
    this.indicator = vscode.window.createStatusBarItem(
      'aicmd.mcp',
      vscode.StatusBarAlignment.Left,
      51
    );
    this.indicator.command = 'aicmd.detachMcp';
    this.registerNativeTools();
  }

  /** 绑定会话并注册 / 复制 MCP 工具配置。 */
  async attach(sessionId: string, extensionPath: string): Promise<ToolAttachResult> {
    const bound = (await this.launcher.api('/api/mcp/bind', { sessionId })) as BoundSessionInfo;
    this.apply(bound);
    const registration = this.nativeTools ? 'registered' : await this.ensureTool(extensionPath);
    return { bound, registration };
  }

  async unbind(): Promise<void> {
    try {
      await this.launcher.api('/api/mcp/unbind', {});
    } finally {
      this.unregisterTool();
      this.apply(null);
    }
  }

  /** 后端退出 / 面板全关：清理本地状态和 CodeBuddy 注册项。 */
  reset(): void {
    this.unregisterTool();
    this.apply(null);
  }

  /** 把 MCP 配置写入剪贴板（命令入口，也用于非 CodeBuddy 宿主）。 */
  async copyConfig(extensionPath: string): Promise<void> {
    const server = this.serverConfig(extensionPath);
    if (!server) {
      vscode.window.showErrorMessage(
        t('未找到 MCP 入口 dist/mcp.js，请先构建扩展。', 'MCP entry dist/mcp.js not found. Build the extension first.')
      );
      return;
    }
    await vscode.env.clipboard.writeText(this.configText(server));
    vscode.window.showInformationMessage(
      t('MCP 配置已复制到剪贴板，粘贴到 AI 编辑器的 MCP 设置即可。', 'MCP config copied to the clipboard. Paste it into your AI editor MCP settings.')
    );
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.unregisterTool();
    for (const tool of this.toolDisposables) tool.dispose();
    this.toolDisposables.length = 0;
    this.indicator.dispose();
  }

  /**
   * 新版 VSCode / Copilot 宿主直接在插件里注册语言模型工具。
   * 老宿主没有 vscode.lm 时自动跳过，仍走 MCP / 剪贴板方案。
   */
  private registerNativeTools(): void {
    const lm = (vscode as any).lm;
    if (!lm || typeof lm.registerTool !== 'function') return;

    const register = (
      name: string,
      message: string,
      run: (input: any) => Promise<string>
    ) => {
      this.toolDisposables.push(
        lm.registerTool(name, {
          invoke: async (options: any) => {
            try {
              const text = await run(options?.input || {});
              return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(text),
              ]);
            } catch (e: any) {
              return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(String(e?.message || e)),
              ]);
            }
          },
          prepareInvocation: () => ({ invocationMessage: message }),
        })
      );
    };

    register('aicmd_sessionInfo', t('读取 AICmd 终端信息', 'Reading AICmd terminal info'), async () => {
      const bound = (await this.launcher.api('/api/mcp/status', {})) as BoundSessionInfo | null;
      return bound ? JSON.stringify(bound, null, 2) : NATIVE_NO_BINDING;
    });
    register('aicmd_sessionRead', t('读取 AICmd 终端屏幕', 'Reading AICmd terminal screen'), async (input) => {
      const lines = Number(input.lines);
      const output = await this.launcher.api('/api/mcp/read', {
        lines: Number.isFinite(lines) ? lines : undefined,
      });
      return String(output || t('（终端暂无可读输出）', '(No terminal output yet)'));
    });
    register('aicmd_sessionExec', t('在 AICmd 终端执行命令', 'Running command in AICmd terminal'), async (input) => {
      const result: any = await this.launcher.api('/api/mcp/exec', {
        command: String(input.command || ''),
        timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : undefined,
      });
      return this.formatNativeExecResult(result);
    });
    register('aicmd_sessionOutput', t('读取 AICmd 剩余输出', 'Reading remaining AICmd output'), async (input) => {
      const offset = Number(input.offset);
      const length = Number(input.length);
      const chunk: any = await this.launcher.api('/api/mcp/output', {
        offset: Number.isFinite(offset) ? offset : undefined,
        length: Number.isFinite(length) ? length : undefined,
      });
      let body = String(chunk?.output || '');
      const next = Number(chunk?.offset || 0) + body.length;
      body += `\n\n[chars ${next}/${Number(chunk?.totalLength || 0)}]`;
      if (chunk?.truncated) body += `\n[more: aicmd_sessionOutput offset=${next}]`;
      return body;
    });
    register('aicmd_sessionInterrupt', t('中断 AICmd 终端命令', 'Interrupting AICmd terminal'), async () => {
      await this.launcher.api('/api/mcp/interrupt', {});
      return t('已发送 Ctrl+C / Sent Ctrl+C', 'Sent Ctrl+C to the attached terminal.');
    });
    register('aicmd_sessionDetach', t('解除 AICmd 终端绑定', 'Detaching AICmd terminal'), async () => {
      await this.unbind();
      return t('已解除绑定 / Detached', 'Terminal detached from this conversation.');
    });
  }

  private formatNativeExecResult(result: any): string {
    let body = String(result?.output || '');
    const header: string[] = [];
    if (result?.exitCode !== undefined) header.push(`[exit ${result.exitCode}]`);
    if (result?.timedOut) {
      header.push(
        t(
          '[超时：命令可能仍在运行，或被前台程序占用；先用 AICmd 终端屏幕工具查看，必要时中断。]',
          '[Timed out: the command may still be running, or a foreground program owns the terminal.]'
        )
      );
    } else if (!body.trim()) {
      body = t('(命令已执行，无输出 / Command executed, no output)', '(Command executed, no output)');
    }
    if (header.length) body = header.join('\n') + '\n\n' + body;
    if (result?.truncated) {
      const next = Number(result?.totalLength || 0) - String(result?.output || '').length;
      body +=
        t('\n... (输出过长已截断 / output truncated)', '\n... (output truncated)') +
        `\n[使用 aicmd_sessionOutput offset=${next} 读取剩余内容 / Read the rest with aicmd_sessionOutput offset=${next}]`;
    }
    return body;
  }

  /** 绑定后主动刷新一次状态（面板恢复时用）。 */
  async refreshStatus(): Promise<void> {
    try {
      const bound = (await this.launcher.api('/api/mcp/status', {})) as BoundSessionInfo | null;
      this.apply(bound);
    } catch {
      /* 后端未就绪 */
    }
  }

  // ========== 内部方法 ==========

  private async ensureTool(extensionPath: string): Promise<ToolRegistration> {
    const server = this.serverConfig(extensionPath);
    if (!server) return 'unavailable';
    const registerCommand = 'tencentcloud.codingcopilot.mcp.registerServer';
    try {
      const commands = await vscode.commands.getCommands(true);
      if (commands.includes(registerCommand)) {
        await vscode.commands.executeCommand(registerCommand, {
          extensionId: 'fefeding.vscode-aicmd',
          name: 'aicmd',
          config: server,
        });
        this.registered = true;
        return 'registered';
      }
    } catch {
      /* 注册失败时退回剪贴板方案 */
    }
    try {
      await vscode.env.clipboard.writeText(this.configText(server));
      return 'clipboard';
    } catch {
      return 'unavailable';
    }
  }

  private unregisterTool(): void {
    if (!this.registered) return;
    this.registered = false;
    vscode.commands
      .executeCommand('tencentcloud.codingcopilot.mcp.unregisterServer', {
        extensionId: 'fefeding.vscode-aicmd',
        name: 'aicmd',
      })
      .then(
        () => undefined,
        () => undefined
      );
  }

  private serverConfig(extensionPath: string): { type: 'stdio'; command: string; args: string[]; env?: Record<string, string> } | null {
    const script = path.join(extensionPath, 'dist', 'mcp.js');
    if (!fs.existsSync(script)) return null;
    const nodeBin = this.launcher.nodeBinary;
    const env: Record<string, string> = {};
    if (nodeBin === process.execPath) env.ELECTRON_RUN_AS_NODE = '1';
    if (this.launcher.dataDirectory !== path.join(os.homedir(), '.aicmd')) {
      env.AICMD_DATA_DIR = this.launcher.dataDirectory;
    }
    return {
      type: 'stdio',
      command: nodeBin,
      args: [script],
      ...(Object.keys(env).length ? { env } : {}),
    };
  }

  private configText(server: Record<string, unknown>): string {
    return JSON.stringify({ mcpServers: { aicmd: server } }, null, 2);
  }

  private apply(bound: BoundSessionInfo | null): void {
    this.bound = bound;
    // 控制 package.json 中 languageModelTools 的 when: aicmd.mcpBound
    vscode.commands
      .executeCommand('setContext', 'aicmd.mcpBound', !!bound)
      .then(
        () => undefined,
        () => undefined
      );
    if (bound) {
      const label = bound.sessionName || bound.sessionId;
      this.indicator.text = `$(terminal) ${label}`;
      this.indicator.tooltip =
        t('AI 对话可通过 MCP 操作该终端：', 'AI chat can operate this terminal via MCP: ') +
        label +
        '\n' + t('点击解除', 'Click to detach');
      this.indicator.show();
      this.startPolling();
    } else {
      this.indicator.hide();
      this.stopPolling();
    }
    try {
      this.onChange?.(bound);
    } catch {
      /* ignore */
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), 5000);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private async poll(): Promise<void> {
    if (this.polling || !this.bound || !this.launcher.isStarted) return;
    this.polling = true;
    try {
      const bound = (await this.launcher.api('/api/mcp/status', {})) as BoundSessionInfo | null;
      const current = this.bound;
      if (!current) return;
      if (!bound || bound.sessionId !== current.sessionId) this.apply(bound);
    } catch {
      /* ignore */
    } finally {
      this.polling = false;
    }
  }
}

export class ChatContextBridge implements vscode.Disposable {
  async capability(): Promise<ChatContextCapability> {
    try {
      const commands = new Set(await vscode.commands.getCommands(true));
      const host = hostName();

      // 原生 VSCode：未启动 AI 对话插件时不显示入口。
      const active = activeAiChatExtensions();
      if (isOfficialVsCode(host) && active.length === 0) {
        return { available: false, host };
      }

      if (commands.has(COMMANDS.codebuddy)) {
        return { available: true, adapter: 'codebuddy', host };
      }
      if (commands.has(COMMANDS.trae)) {
        return { available: true, adapter: 'trae', host };
      }
      if (isOfficialVsCode(host)) {
        if (
          active.some((id) => id.includes('copilot-chat')) &&
          commands.has(COMMANDS.workbenchChat)
        ) {
          return { available: true, adapter: 'workbench-chat', host };
        }
        for (const plugin of FOCUS_ADAPTERS) {
          if (
            active.some(plugin.matches) &&
            commands.has(plugin.command) &&
            commands.has(COMMANDS.paste)
          ) {
            return {
              available: true,
              adapter: 'clipboard-focus',
              focusCommand: plugin.command,
              host,
            };
          }
        }
      }
      // Cursor / Windsurf 及其它 VSCode 分支通常保留 workbench 聊天命令。
      if (commands.has(COMMANDS.workbenchChat)) {
        return { available: true, adapter: 'workbench-chat', host };
      }
      return { available: false, host };
    } catch {
      return { available: false };
    }
  }

  async attachToChat(context: TerminalChatContext): Promise<boolean> {
    try {
      const capability = await this.capability();
      if (!capability.available || !capability.adapter) return false;

      const name = context.sessionName || context.sessionId || t('终端', 'Terminal');
      const label = `@Terminal · ${name}`;
      const target = [
        context.connectionType,
        context.host
          ? `${context.username ? context.username + '@' : ''}${context.host}`
          : '',
      ].filter(Boolean).join(' ');
      const snapshot =
        context.snapshot.trim() || t('（终端暂无输出）', '(no terminal output yet)');
      const text = [
        isChinese
          ? `[AICmd] 终端会话「${name}」${target ? `(${target})` : ''}的输出快照：`
          : `[AICmd] Output snapshot of terminal "${name}"${target ? ` (${target})` : ''}:`,
        '',
        ...(context.toolHint ? [context.toolHint, ''] : []),
        snapshot,
      ].join('\n');
      const lines = text.split('\n');

      switch (capability.adapter) {
        case 'codebuddy':
          await vscode.commands.executeCommand(COMMANDS.codebuddy, {
            contextsInfo: [
              {
                type: 'context',
                mentionType: 'terminal',
                label,
                value: '',
                displayText: label,
                title: text,
                terminalSelection: text,
                terminalName: label,
                terminalCommand: '',
                terminalCwd: '',
                terminalLineCount: lines.length,
                terminalTruncated: false,
              },
            ],
            options: { autoSend: false },
          });
          return true;

        case 'trae':
          await vscode.commands.executeCommand(COMMANDS.trae, {
            addToChat: true,
            keepOpen: true,
            terminalPayload: {
              terminalId: `aicmd:${context.sessionId || context.connectionId || 'terminal'}`,
              command: '',
              output: text,
              selection: text,
              selectionLines: lines,
              range: {
                start: { x: 0, y: 0 },
                end: { x: lines[lines.length - 1]?.length || 0, y: lines.length - 1 },
              },
            },
          });
          return true;

        case 'workbench-chat':
          if (context.nativeTools && vsCodeAtLeast(1, 105)) {
            // 以连接名命名的上下文文件 = 对话里的引用 chip；输入框只留空白，不发送。
            const reference = terminalReferenceFile(name, target);
            await vscode.commands.executeCommand(COMMANDS.workbenchChat, {
              query: ' ',
              isPartialQuery: true,
              attachFiles: [reference],
            });
          } else if (context.nativeTools && vsCodeAtLeast(1, 99)) {
            // 1.99–1.104 没有 attachFiles，退而使用工具引用。
            await vscode.commands.executeCommand(COMMANDS.workbenchChat, {
              query: isChinese
                ? `[AICmd] 终端「${name}」${target ? `(${target})` : ''}已绑定，可直接使用下方 AICmd 引用查看屏幕或执行命令。`
                : `[AICmd] Terminal "${name}"${target ? ` (${target})` : ''} is attached; use the AICmd reference below to read the screen or run commands.`,
              isPartialQuery: true,
              toolIds: [NATIVE_TOOL_REFERENCE_ID],
            });
          } else {
            await vscode.commands.executeCommand(COMMANDS.workbenchChat, {
              query: text,
              isPartialQuery: true,
            });
          }
          return true;

        case 'clipboard-focus':
          if (!capability.focusCommand) return false;
          await vscode.env.clipboard.writeText(text);
          await vscode.commands.executeCommand(capability.focusCommand);
          await vscode.commands.executeCommand(COMMANDS.paste);
          return true;

        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  dispose(): void {
    /* 无外部资源 */
  }
}
