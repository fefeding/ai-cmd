import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getDataDir, getDataPath, ensureDir } from '../utils/data-dir';
import { AuditService } from './audit.service';
import { assessDangerousCommand } from '../utils/shell';
import {
  AgentEngine, ToolRegistry, ContextManager, SecurityGuard,
  createLLMProvider,
} from '@cicctencent/agent-core';
import type {
  LLMProvider, AgentEvent as CoreAgentEvent,
  Message, ToolContext, ToolDefinition,
} from '@cicctencent/agent-core';
import { extractTextFromContent } from '@cicctencent/agent-core';

const ENCRYPTED_PREFIX = 'enc:v1:';

// ========== 公共导出类型 ==========

export interface AIConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/** Agent 事件类型 */
export type AgentEventType = 'thinking' | 'message' | 'tool_call' | 'tool_result' | 'audit_entry' | 'done' | 'error' | 'system_info';

/** Agent 事件（应用层简化格式） */
export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  tool?: string;
  args?: any;
  result?: string;
  error?: string;
  auditEntry?: any;
}

export type AgentEventCallback = (event: AgentEvent) => void;

export type ToolExecutor = (args: any, sessionId: string) => Promise<string>;

// ========== 显示消息 & 历史 ==========

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  skillName?: string;
  isSystemInfo?: boolean;
  agentSteps?: DisplayAgentStep[];
}

export interface DisplayAgentStep {
  type: 'tool_call' | 'tool_result';
  tool?: string;
  args?: any;
  result?: string;
  collapsed?: boolean;
}

export interface HistoryMeta {
  sessionId: string;
  sessionName?: string;
  savedAt: number;
  messageCount: number;
  preview: string;
}

interface HistoryFile {
  meta: HistoryMeta;
  messages: DisplayMessage[];
}

// ========== 服务依赖接口 ==========

interface ISSHService {
  writeData(sessionId: string, data: string | Buffer): boolean;
  captureOutput(sessionId: string, timeoutMs?: number): Promise<string>;
  getSession(sessionId: string): any;
  getSystemContext(sessionId: string): Promise<string>;
}

interface ISkillService {
  getSkill(id: string): { name: string; content: string } | undefined;
}

// ========== Agent System Prompt ==========

const AGENT_SYSTEM_PROMPT = `You are a powerful AI terminal Agent that can directly operate the user's terminal Shell.

Your capabilities:
1. Execute commands directly in the terminal via the execute_command tool
2. Read the terminal's current output via the read_terminal tool
3. Understand command execution results and make decisions accordingly
4. Automatically complete multi-step tasks
5. Generate script files to execute complex or multi-step operations

Working principles:
1. **Take action**: When the user asks you to do something, use tools to execute directly, don't just suggest commands
2. **Verify results**: After executing a command, check the output to confirm success
3. **Safety first**: rm commands automatically move files to a recycle bin (~/.aicmd/.trash/) instead of permanent deletion; extremely destructive operations will be blocked. For other dangerous operations (format, overwrite disk, etc.), explain the risk in content first and let the user confirm before executing
4. **Step-by-step**: Complete complex tasks step by step, checking results after each step
5. **Error handling**: If a command fails, analyze the cause and try to fix it or use an alternative

Script strategy (important):
Generate a script file instead of executing commands one by one when the task meets any of the following conditions:
- More than 3 steps with dependencies between them
- Requires loops, conditionals, error handling, or other logic
- Needs to process large numbers of files or batch operations
- Needs to parse text/logs/JSON or other complex data

Script execution flow:
1. First detect available languages with \`which python3 node bash\` (Windows: \`where python node powershell\`)
2. Prefer languages already known from system environment info
3. Create and execute the script based on the platform:

**Linux/macOS (Bash):**
\`\`\`
cat > /tmp/_ai_task.sh << 'SCRIPT_EOF'
#!/bin/bash
set -e
# script content...
SCRIPT_EOF
chmod +x /tmp/_ai_task.sh && bash /tmp/_ai_task.sh
\`\`\`

**Windows (PowerShell):**
\`\`\`powershell
Set-Content -Path $env:TEMP\\_ai_task.ps1 -Value @'
# PowerShell script content...
'@
& $env:TEMP\\_ai_task.ps1
\`\`\`

4. Execute the script and check results
5. Clean up temporary files

Language selection priority:
- Shell/Bash (Linux/macOS): system admin, file ops, process management
- PowerShell (Windows): system admin, file ops, process management, WMI/CIM queries
- Python: log analysis, data processing, text parsing, complex logic (cross-platform)
- Node.js: JSON processing, HTTP requests, complex data transformation (cross-platform)

Cross-platform notes:
- Determine target platform from OS and Shell fields in system environment info
- Linux: OS=Linux, use bash commands
- macOS: OS=Darwin, no \`free\`/\`ss\`/\`systemctl\`, use \`vm_stat\`/\`lsof\`/\`launchctl\` instead
- Windows: Shell=PowerShell, use PowerShell cmdlets, temp files in \`$env:TEMP\`
- Always check platform first before selecting commands when writing scripts

Response format (important):
- Use Markdown format
- Before tool calls, just one sentence explaining what you're about to do, don't explain command details
- After task completion, give a brief conclusion of the results, don't repeat command output, don't list execution steps, don't add unnecessary explanations
- If the operation succeeds, state the result directly (e.g., "Created", "Stopped", "Found 3 errors")
- If the operation fails, explain the cause and suggested fix
- No fluff, no filler, no summarizing what's already obvious

**Language rule (CRITICAL)**: Always respond in the SAME language as the user's message. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the user's language exactly.`;


// ============================================================
// AIService — 底层 AI 能力委托给 @cicctencent/agent-core
// ============================================================

export class AIService {
  // ---- 配置 & 持久化 ----
  private configDir: string;
  private configPath: string;
  private config: AIConfig;
  private historyDir: string;
  private messagesDir: string;

  // ---- agent-core 组件 ----
  private llmProvider?: LLMProvider;
  private toolRegistry: ToolRegistry;
  private contextManager: ContextManager;
  private securityGuard: SecurityGuard;
  private engine?: AgentEngine;
  private abortControllers = new Map<string, AbortController>();

  // ---- 状态 ----
  private loadedSessions = new Set<string>();
  private sshService?: ISSHService;
  private skillService?: ISkillService;
  private auditService?: AuditService;
  private readonly MAX_MESSAGES = 50;
  private readonly MAX_AGENT_ITERATIONS = 15;

  constructor(sshService?: ISSHService, skillService?: ISkillService, auditService?: AuditService) {
    this.configDir = getDataDir();
    this.configPath = getDataPath('ai-config.json');
    this.historyDir = getDataPath('ai-history');
    this.messagesDir = path.resolve('data', 'messages');
    this.config = this.getDefaultConfig();
    this.sshService = sshService;
    this.skillService = skillService;
    this.auditService = auditService;

    // 初始化 agent-core 组件
    this.toolRegistry = new ToolRegistry();
    this.contextManager = new ContextManager();
    this.securityGuard = new SecurityGuard({
      trashDir: '~/.aicmd/.trash',
      deleteProtection: true,
    });
    // agent-core 0.1.4 已内置 Windows 黑名单（format C:, clear-disk, rd /s, Remove-Item drive root）
    // 无需再手动添加

    this.loadConfig();
    try { if (!fs.existsSync(this.historyDir)) fs.mkdirSync(this.historyDir, { recursive: true }); } catch (_) { /* ignore */ }
    ensureDir(this.messagesDir);
    this.registerBuiltinTools();
  }

  // ========== LLM Provider & Engine 懒初始化 ==========

  private ensureLLMProvider(): LLMProvider | undefined {
    if (!this.config.apiKey) return undefined;
    if (!this.llmProvider) {
      this.llmProvider = createLLMProvider({
        provider: this.config.provider || 'openai',
        model: this.config.model,
        apiKey: this.config.apiKey,
        baseUrl: this.config.baseUrl,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      });
    }
    return this.llmProvider;
  }

  private resetProviderAndEngine(): void {
    this.llmProvider = undefined;
    this.engine = undefined;
  }

  private getEngine(): AgentEngine | undefined {
    const provider = this.ensureLLMProvider();
    if (!provider) return undefined;
    if (!this.engine) {
      this.engine = new AgentEngine({
        llmProvider: provider,
        toolRegistry: this.toolRegistry,
        contextManager: this.contextManager,
        securityGuard: this.securityGuard,
        basePrompt: AGENT_SYSTEM_PROMPT,
        maxIterations: this.MAX_AGENT_ITERATIONS,
        maxMessages: this.MAX_MESSAGES,
        hooks: this.buildHooks(),
      });
    }
    return this.engine;
  }

  private buildHooks(): import('@cicctencent/agent-core').Hook[] {
    if (!this.auditService) return [];
    const auditService = this.auditService;
    const sshService = this.sshService;
    return [{
      name: 'audit-tool-call',
      event: 'after_tool' as const,
      handler: async (ctx) => {
        try {
          const command = ctx.tool === 'execute_command'
            ? (ctx.args?.command as string || '')
            : JSON.stringify(ctx.args);
          const auditEntry = auditService.log({
            sessionId: ctx.sessionId,
            sessionName: sshService?.getSession(ctx.sessionId)?.name,
            connectionId: sshService?.getSession(ctx.sessionId)?.connectionId,
            userMessage: '',
            tool: ctx.tool || '',
            command,
            result: (ctx.result || '').substring(0, 5000),
            duration: ctx.duration || 0,
            status: ctx.isError ? 'error' : 'success',
          });
        } catch { /* 审计失败不影响主流程 */ }
      },
    }];
  }

  // ========== 配置管理 ==========

  private getDefaultConfig(): AIConfig {
    return {
      enabled: true, provider: 'openai', apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini', maxTokens: 4000, temperature: 0.3,
    };
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const savedConfig = this.decryptConfig(JSON.parse(data));
        this.config = { ...this.getDefaultConfig(), ...savedConfig };
      }
    } catch (error) { console.error('[AIService] Failed to load config:', error); }
  }

  private saveConfig(): void {
    try {
      if (!fs.existsSync(this.configDir)) fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.encryptConfig(this.config), null, 2), { encoding: 'utf-8', mode: 0o600 });
      try { fs.chmodSync(this.configPath, 0o600); } catch (_) { /* ignore */ }
    } catch (error) { console.error('[AIService] Failed to save config:', error); throw error; }
  }

  private encryptConfig(config: AIConfig): AIConfig {
    const encrypted = { ...config };
    if (encrypted.apiKey && !encrypted.apiKey.startsWith(ENCRYPTED_PREFIX)) {
      encrypted.apiKey = this.encryptSecret(encrypted.apiKey);
    }
    return encrypted;
  }

  private decryptConfig(config: Partial<AIConfig>): Partial<AIConfig> {
    const decrypted = { ...config };
    if (typeof decrypted.apiKey === 'string' && decrypted.apiKey.startsWith(ENCRYPTED_PREFIX)) {
      decrypted.apiKey = this.decryptSecret(decrypted.apiKey);
    }
    return decrypted;
  }

  private getEncryptionKey(): Buffer {
    const keyPath = getDataPath('ai-config.key');
    try {
      if (fs.existsSync(keyPath)) {
        return crypto.createHash('sha256').update(fs.readFileSync(keyPath, 'utf8').trim()).digest();
      }
      const secret = crypto.randomBytes(32).toString('base64url');
      fs.writeFileSync(keyPath, secret, { encoding: 'utf8', mode: 0o600 });
      try { fs.chmodSync(keyPath, 0o600); } catch (_) { /* ignore */ }
      return crypto.createHash('sha256').update(secret).digest();
    } catch (error: any) {
      console.warn(`[AIService] Failed to load encryption key: ${error.message}`);
      return crypto.createHash('sha256').update(`${os.hostname()}:${os.homedir()}:aicmd-ai`).digest();
    }
  }

  private encryptSecret(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
  }

  private decryptSecret(value: string): string {
    try {
      const payload = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (error: any) {
      console.warn(`[AIService] Failed to decrypt API key: ${error.message}`);
      return '';
    }
  }

  // ========== 公共配置 API ==========

  getConfig(): AIConfig {
    const maskedConfig = { ...this.config };
    if (maskedConfig.apiKey) {
      const key = maskedConfig.apiKey;
      maskedConfig.apiKey = key.substring(0, 8) + '****' + key.substring(key.length - 4);
    }
    return maskedConfig;
  }

  getFullConfig(): AIConfig { return { ...this.config }; }

  updateConfig(updates: Partial<AIConfig>): AIConfig {
    // 如果传入的 apiKey 是掩码值（包含 ****），则保留原有的真实 apiKey
    if (updates.apiKey && updates.apiKey.includes('****')) {
      delete updates.apiKey;
    }
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    this.resetProviderAndEngine();
    return this.getConfig();
  }

  async testConfig(config?: Partial<AIConfig>): Promise<{ success: boolean; message: string }> {
    const testCfg = { ...this.config, ...config };
    if (!testCfg.apiKey) return { success: false, message: 'API Key not configured' };
    try {
      const provider = createLLMProvider({
        provider: testCfg.provider || 'openai', model: testCfg.model,
        apiKey: testCfg.apiKey, baseUrl: testCfg.baseUrl,
      });
      const ok = await provider.ping();
      return ok
        ? { success: true, message: 'Connection successful, model available' }
        : { success: false, message: 'Connection failed or model unavailable' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }

  // ========== 工具注册 ==========

  registerTool(name: string, definition: ToolDefinition, executor: ToolExecutor): void {
    this.toolRegistry.register({
      definition,
      executor: (args, _ctx) => executor(args, _ctx.sessionId),
      category: 'custom',
    });
    console.log(`[AIService] Tool registered: ${name}`);
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.toolRegistry.getDefinitions();
  }

  private registerBuiltinTools(): void {
    // execute_command
    this.toolRegistry.register({
      definition: {
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Execute a command in the current terminal Shell and return the output. Supports any bash/zsh/powershell commands.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The shell command to execute' },
              timeout: { type: 'number', description: 'Time to wait for output in milliseconds, default 2000. Increase for long-running commands' },
            },
            required: ['command'],
          },
        },
      },
      executor: async (args: Record<string, unknown>, ctx: ToolContext) => {
        return this.executeCommand(args.command as string, ctx.sessionId, (args.timeout as number) || 2000);
      },
      category: 'builtin',
    });

    // read_terminal
    this.toolRegistry.register({
      definition: {
        type: 'function',
        function: {
          name: 'read_terminal',
          description: 'Read the current terminal output (last 50 lines), useful for understanding the terminal state.',
          parameters: { type: 'object', properties: {} },
        },
      },
      executor: async (_args: Record<string, unknown>, ctx: ToolContext) => {
        return this.readTerminal(ctx.sessionId);
      },
      category: 'builtin',
    });
  }

  // ========== 命令安全检查 ==========

  private async isWindowsSession(sessionId: string): Promise<boolean> {
    if (!this.sshService) return false;
    try {
      const ctx = await this.sshService.getSystemContext(sessionId);
      return /OS:.*Windows|Shell:.*PowerShell|Shell:.*pwsh/i.test(ctx);
    } catch { return false; }
  }

  private async sanitizeCommand(command: string, sessionId: string): Promise<{ safe: boolean; rewritten?: string; reason?: string }> {
    const trimmed = command.trim();
    const risk = assessDangerousCommand(trimmed);
    if (!risk.safe) return risk;
    const isWin = await this.isWindowsSession(sessionId);
    return isWin ? this.sanitizeWindowsCommand(trimmed) : { safe: true };
  }

  private sanitizeWindowsCommand(trimmed: string): { safe: boolean; rewritten?: string; reason?: string } {
    const blocked = [
      /format\s+[a-z]:/i, /clear-disk/i,
      /remove-item\s+.*[a-z]:\s*$/i, /remove-item\s+.*-recurse.*[a-z]:\s*$/i,
      /rd\s+\/s\s+[a-z]:\s*$/i,
    ];
    for (const pattern of blocked) {
      if (pattern.test(trimmed)) return { safe: false, reason: 'BLOCKED: Extremely dangerous destructive operation' };
    }
    const removePatterns = [/^(Remove-Item|ri|del|rd)\s+(.+)$/i];
    for (const pattern of removePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const targets = match[2]
          .replace(/-Recurse/gi, '').replace(/-Force/gi, '').replace(/-Confirm:\$false/gi, '')
          .replace(/\/s/gi, '').replace(/\/q/gi, '').trim();
        const trashDir = '$env:USERPROFILE\\.aicmd\\.trash';
        const ts = Date.now();
        return {
          safe: true,
          rewritten: `New-Item -ItemType Directory -Force -Path "${trashDir}" | Out-Null; Move-Item -Path ${targets} -Destination "${trashDir}\\_del_${ts}" -Force`,
        };
      }
    }
    return { safe: true };
  }

  // ========== 工具执行 ==========

  private async executeCommand(command: string, sessionId: string, timeout: number): Promise<string> {
    if (!this.sshService) return 'Error: SSH service not available';
    const session = this.sshService.getSession(sessionId);
    if (!session) return `Error: Session ${sessionId} not found`;

    const check = await this.sanitizeCommand(command, sessionId);
    if (!check.safe) return check.reason!;
    const actualCommand = check.rewritten || command;
    if (check.rewritten) console.log(`[AIService] Safety: rewrote "${command}" -> "${actualCommand}"`);

    try {
      const outputPromise = this.sshService.captureOutput(sessionId, timeout);
      this.sshService.writeData(sessionId, actualCommand + '\n');
      const output = await outputPromise;

      const lines = output.split('\n');
      if (lines.length > 0 && lines[0].trim().includes(actualCommand.trim().substring(0, 20))) lines.shift();
      const cleanOutput = lines.join('\n').trim();
      if (!cleanOutput) return '(Command executed, no output)';

      const maxLength = 5000;
      if (cleanOutput.length > maxLength) {
        return cleanOutput.substring(0, maxLength) + `\n... (output truncated, ${cleanOutput.length} chars total)`;
      }
      return cleanOutput;
    } catch (error: any) {
      return `Command execution failed: ${error.message}`;
    }
  }

  private async readTerminal(sessionId: string): Promise<string> {
    if (!this.sshService) return 'Error: SSH service not available';
    try {
      const output = await this.sshService.captureOutput(sessionId, 500);
      if (!output.trim()) return '(No terminal output)';
      return output.split('\n').filter(l => l.trim()).slice(-50).join('\n');
    } catch (error: any) {
      return `Failed to read terminal: ${error.message}`;
    }
  }

  // ========== 系统环境上下文 ==========

  private async getSessionContext(sessionId: string): Promise<string> {
    if (!this.sshService) return '';
    try { return await this.sshService.getSystemContext(sessionId); }
    catch (error) { console.warn('[AIService] Failed to get system context:', error); return ''; }
  }

  // ========== Core → App 事件映射 ==========

  private mapCoreEvent(event: CoreAgentEvent): AgentEvent | null {
    switch (event.type) {
      case 'thinking':    return { type: 'thinking', content: event.content };
      case 'tool_call':   return { type: 'tool_call', tool: event.tool, args: event.args };
      case 'tool_result': return { type: 'tool_result', tool: event.tool, result: event.result };
      case 'message':     return { type: 'message', content: event.content };
      case 'done':        return { type: 'done', content: event.content };
      case 'error':       return { type: 'error', error: event.error };
      default:            return null;
    }
  }

  // ========== Agent 核心循环 ==========

  async agentRun(
    sessionId: string,
    userMessage: string,
    context: string | undefined,
    eventCallback: AgentEventCallback,
    skillId?: string,
    locale?: string,
  ): Promise<void> {
    const engine = this.getEngine();
    if (!engine) {
      eventCallback({ type: 'error', error: 'API Key not configured. Please set it in AI settings.' });
      return;
    }

    // 构建 system prompt 覆盖片段
    let systemPromptOverride = '';

    if (locale) {
      const langName = locale.startsWith('zh') ? 'Chinese' : locale.startsWith('ja') ? 'Japanese' : locale.startsWith('ko') ? 'Korean' : 'English';
      systemPromptOverride += `\n\n[User's UI language preference: ${langName} (${locale}). If the user's message language is ambiguous, prefer responding in ${langName}.]`;
    }

    const sysContext = await this.getSessionContext(sessionId);
    if (sysContext && sysContext !== 'Failed to collect system info') {
      systemPromptOverride += `\n\n${sysContext}`;
    }

    if (skillId && this.skillService) {
      const skill = this.skillService.getSkill(skillId);
      if (skill) {
        systemPromptOverride += `\n\n## Current Task Instructions (Skill: ${skill.name})\n\n${skill.content}`;
      }
    }

    // 加载并注入会话历史
    const savedHistory = this.loadChatMessages(sessionId);
    if (savedHistory && savedHistory.length > 0) {
      engine.setHistory(sessionId, savedHistory);
    }

    // AbortController 管理
    const ctrl = new AbortController();
    this.abortControllers.set(sessionId, ctrl);

    try {
      const eventStream = engine.run({
        sessionId,
        message: userMessage,
        context: context ? { sessionId, terminalOutput: context } : { sessionId },
        abortSignal: ctrl.signal,
        systemPromptOverride: systemPromptOverride || undefined,
        skillId,
      });

      for await (const coreEvent of eventStream) {
        const mapped = this.mapCoreEvent(coreEvent);
        if (mapped) eventCallback(mapped);
      }
    } catch (error: any) {
      eventCallback({ type: 'error', error: error.message || 'Agent runtime error' });
    } finally {
      this.abortControllers.delete(sessionId);
      // 持久化 LLM 上下文消息
      try {
        const snapshot = engine.getHistorySnapshot(sessionId);
        if (snapshot && snapshot.length > 0) this.saveChatMessages(sessionId, snapshot);
      } catch { /* ignore */ }
    }
  }

  stopAgent(sessionId: string): boolean {
    const ctrl = this.abortControllers.get(sessionId);
    if (ctrl) {
      ctrl.abort();
      this.engine?.abort(sessionId);
      return true;
    }
    return false;
  }

  // ========== 非 Agent 对话 ==========

  async chat(sessionId: string, userMessage: string, context?: string): Promise<string> {
    const provider = this.ensureLLMProvider();
    if (!provider) throw new Error('API Key not configured. Please set it in AI settings.');

    const history = this.loadChatMessages(sessionId) || [];
    const messages: Message[] = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }];
    if (context) messages.push({ role: 'system', content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\`` });
    messages.push(...history);
    messages.push({ role: 'user', content: userMessage });
    history.push({ role: 'user', content: userMessage });

    try {
      const response = await provider.chat({
        messages,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
      const content = response.choices?.[0]?.message?.content;
      if (content) {
        const textContent = extractTextFromContent(content);
        history.push({ role: 'assistant', content: textContent });
        this.saveChatMessages(sessionId, history);
        return textContent;
      }
      throw new Error('AI response is empty');
    } catch (error: any) {
      history.pop();
      throw new Error(error.response?.data?.error?.message || error.message || 'AI request failed');
    }
  }

  async *chatStream(
    sessionId: string,
    userMessage: string,
    context?: string,
  ): AsyncGenerator<string, void, unknown> {
    const provider = this.ensureLLMProvider();
    if (!provider) throw new Error('API Key not configured. Please set it in AI settings.');

    const history = this.loadChatMessages(sessionId) || [];
    const messages: Message[] = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }];
    if (context) messages.push({ role: 'system', content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\`` });
    messages.push(...history);
    messages.push({ role: 'user', content: userMessage });
    history.push({ role: 'user', content: userMessage });

    let fullResponse = '';
    try {
      const stream = provider.chatStream({
        messages,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
      for await (const chunk of stream) {
        const content = chunk.delta?.content;
        if (content) {
          const textContent = extractTextFromContent(content);
          fullResponse += textContent;
          yield textContent;
        }
      }
      if (fullResponse) {
        history.push({ role: 'assistant', content: fullResponse });
        this.saveChatMessages(sessionId, history);
      }
    } catch (error: any) {
      history.pop();
      throw new Error(error.response?.data?.error?.message || error.message || 'AI request failed');
    }
  }

  // ========== LLM 上下文消息持久化 ==========

  clearHistory(sessionId: string): void {
    this.loadedSessions.delete(sessionId);
    this.deleteDisplayHistoryFile(sessionId);
    this.deleteChatMessagesFile(sessionId);
    this.engine?.setHistory(sessionId, []);
  }

  getHistory(sessionId: string): Message[] | null {
    return this.loadChatMessages(sessionId);
  }

  private saveChatMessages(sessionId: string, messages: Message[]): void {
    try {
      ensureDir(this.messagesDir);
      const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(this.messagesDir, `${safe}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ sessionId, updatedAt: Date.now(), messages }, null, 2), 'utf-8');
    } catch { /* 静默失败 */ }
  }

  private loadChatMessages(sessionId: string): Message[] | null {
    try {
      if (!fs.existsSync(this.messagesDir)) return null;
      const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(this.messagesDir, `${safe}.json`);
      if (!fs.existsSync(filePath)) return null;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data && Array.isArray(data.messages)) return data.messages.slice(-this.MAX_MESSAGES);
      return null;
    } catch { return null; }
  }

  private deleteChatMessagesFile(sessionId: string): void {
    try {
      const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(this.messagesDir, `${safe}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* 静默失败 */ }
  }

  // ========== 对话历史持久化（前端显示） ==========

  saveDisplayHistory(sessionId: string, displayMessages: DisplayMessage[], sessionName?: string): void {
    try {
      const filePath = path.join(this.historyDir, `${sessionId}.json`);
      const firstUser = displayMessages.find(m => m.role === 'user');
      const preview = firstUser ? (firstUser.content || '').substring(0, 80) : '';
      const fileData: HistoryFile = {
        meta: { sessionId, sessionName: sessionName || '', savedAt: Date.now(), messageCount: displayMessages.length, preview },
        messages: displayMessages,
      };
      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
    } catch (error) { console.error('[AIService] Failed to save display history:', error); }
  }

  loadDisplayHistory(sessionId: string): DisplayMessage[] | null {
    try {
      const filePath = path.join(this.historyDir, `${sessionId}.json`);
      if (!fs.existsSync(filePath)) return null;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data && Array.isArray(data.messages)) return data.messages;
      if (Array.isArray(data)) return data;
      return null;
    } catch { return null; }
  }

  listDisplayHistories(): HistoryMeta[] {
    const results: HistoryMeta[] = [];
    try {
      if (!fs.existsSync(this.historyDir)) return results;
      const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const fp = path.join(this.historyDir, file);
          const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
          if (data?.meta) {
            results.push(data.meta);
          } else if (Array.isArray(data)) {
            const sid = path.basename(file, '.json');
            const firstUser = data.find((m: any) => m.role === 'user');
            results.push({
              sessionId: sid, sessionName: '',
              savedAt: fs.statSync(fp).mtimeMs,
              messageCount: data.length,
              preview: firstUser ? (firstUser.content || '').substring(0, 80) : '',
            });
          }
        } catch { /* 跳过损坏的文件 */ }
      }
    } catch (error) { console.error('[AIService] Failed to list histories:', error); }
    results.sort((a, b) => b.savedAt - a.savedAt);
    return results;
  }

  deleteDisplayHistoryFile(sessionId: string): void {
    try {
      const filePath = path.join(this.historyDir, `${sessionId}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      this.deleteChatMessagesFile(sessionId);
      this.loadedSessions.delete(sessionId);
    } catch (error) { console.error('[AIService] Failed to delete display history:', error); }
  }
}
