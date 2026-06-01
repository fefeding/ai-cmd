import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { getDataDir, getDataPath, ensureDataDir } from '../utils/data-dir';
import { AuditService, type AuditEntry } from './audit.service';

/**
 * AI 配置接口
 */
export interface AIConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * 对话消息接口（支持 tool calling）
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * 工具调用接口（OpenAI function calling 格式）
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Agent 事件类型
 */
export type AgentEventType = 'thinking' | 'message' | 'tool_call' | 'tool_result' | 'audit_entry' | 'done' | 'error' | 'system_info';

/**
 * Agent 事件
 */
export interface AgentEvent {
  type: AgentEventType;
  content?: string;
  tool?: string;
  args?: any;
  result?: string;
  error?: string;
  auditEntry?: any;
}

/** Agent 事件回调 */
export type AgentEventCallback = (event: AgentEvent) => void;

/**
 * 工具定义（OpenAI tools 格式）
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

/** 工具执行器 */
export type ToolExecutor = (args: any, sessionId: string) => Promise<string>;

/** 已注册的工具 */
interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

/** 对话历史 */
interface ChatHistory {
  sessionId: string;
  messages: ChatMessage[];
  lastActive: number;
}

/** 前端显示消息（持久化用） */
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

/** 历史文件元数据 */
export interface HistoryMeta {
  sessionId: string;
  sessionName?: string;
  savedAt: number;
  messageCount: number;
  preview: string;
}

/** 历史文件完整结构 */
interface HistoryFile {
  meta: HistoryMeta;
  messages: DisplayMessage[];
}

/** Agent 运行状态 */
interface AgentRunState {
  running: boolean;
  aborted: boolean;
}

// 去除 ANSI 转义序列
function stripAnsi(text: string): string {
  return text
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1B\].*?\x07/g, '')
    .replace(/\x1B\[[\?]?[0-9;]*[hlm]/g, '')
    .replace(/\r/g, '');
}

// SSHService 接口（避免循环依赖）
interface ISSHService {
  writeData(sessionId: string, data: string | Buffer): boolean;
  captureOutput(sessionId: string, timeoutMs?: number): Promise<string>;
  getSession(sessionId: string): any;
  getSystemContext(sessionId: string): Promise<string>;
}

// SkillService 接口
interface ISkillService {
  getSkill(id: string): { name: string; content: string } | undefined;
}

/**
 * AI Agent 服务 - 支持工具调用和自主操作终端
 */
export class AIService {
  private configDir: string;
  private configPath: string;
  private config: AIConfig;
  private historyDir: string;
  private chatHistories: Map<string, ChatHistory> = new Map();
  private agentStates: Map<string, AgentRunState> = new Map();
  private toolRegistry: Map<string, RegisteredTool> = new Map();
  private sshService?: ISSHService;
  private skillService?: ISkillService;
  private auditService?: AuditService;
  private readonly MAX_HISTORY_AGE = 24 * 60 * 60 * 1000;
  private readonly MAX_MESSAGES = 50;
  private readonly MAX_AGENT_ITERATIONS = 15;

  // Agent system prompt (English default, language adapts to user input)
  private readonly AGENT_SYSTEM_PROMPT = `You are a powerful AI terminal Agent that can directly operate the user's terminal Shell.

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
Set-Content -Path $env:TEMP\_ai_task.ps1 -Value @'
# PowerShell script content...
'@
& $env:TEMP\_ai_task.ps1
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

  constructor(sshService?: ISSHService, skillService?: ISkillService, auditService?: AuditService) {
    this.configDir = getDataDir();
    this.configPath = getDataPath('ai-config.json');
    this.historyDir = getDataPath('ai-history');
    this.config = this.getDefaultConfig();
    this.sshService = sshService;
    this.skillService = skillService;
    this.auditService = auditService;
    this.loadConfig();
    // 确保历史目录存在
    try { if (!fs.existsSync(this.historyDir)) fs.mkdirSync(this.historyDir, { recursive: true }); } catch (_) { /* ignore */ }
    this.cleanupOldHistories();
    this.registerBuiltinTools();
  }

  private getDefaultConfig(): AIConfig {
    return {
      enabled: true,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      maxTokens: 4000,
      temperature: 0.3,
    };
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const savedConfig = JSON.parse(data);
        this.config = { ...this.getDefaultConfig(), ...savedConfig };
      }
    } catch (error) {
      console.error('[AIService] Failed to load config:', error);
    }
  }

  private saveConfig(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('[AIService] Failed to save config:', error);
      throw error;
    }
  }

  private cleanupOldHistories(): void {
    const now = Date.now();
    for (const [sessionId, history] of this.chatHistories) {
      if (now - history.lastActive > this.MAX_HISTORY_AGE) {
        this.chatHistories.delete(sessionId);
      }
    }
  }

  // ========== 配置管理 ==========

  getConfig(): AIConfig {
    const maskedConfig = { ...this.config };
    if (maskedConfig.apiKey) {
      const key = maskedConfig.apiKey;
      maskedConfig.apiKey = key.substring(0, 8) + '****' + key.substring(key.length - 4);
    }
    return maskedConfig;
  }

  getFullConfig(): AIConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AIConfig>): AIConfig {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    return this.getConfig();
  }

  async testConfig(config?: Partial<AIConfig>): Promise<{ success: boolean; message: string }> {
    const testConfig = { ...this.config, ...config };
    if (!testConfig.apiKey) {
      return { success: false, message: 'API Key not configured' };
    }
    try {
      const response = await axios.post(
        `${testConfig.baseUrl}/chat/completions`,
        {
          model: testConfig.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        },
        {
          headers: {
            'Authorization': `Bearer ${testConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      if (response.data?.choices?.[0]?.message?.content) {
        return { success: true, message: 'Connection successful, model available' };
      }
      return { success: false, message: 'Unexpected response format' };
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.message || 'Connection failed';
      return { success: false, message };
    }
  }

  // ========== 工具注册表 ==========

  /**
   * 注册工具
   */
  registerTool(name: string, definition: ToolDefinition, executor: ToolExecutor): void {
    this.toolRegistry.set(name, { definition, executor });
    console.log(`[AIService] Tool registered: ${name}`);
  }

  /**
   * 获取所有工具定义（OpenAI tools 格式）
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.toolRegistry.values()).map(t => t.definition);
  }

  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    // execute_command - Execute shell command
    this.registerTool('execute_command', {
      type: 'function',
      function: {
        name: 'execute_command',
        description: 'Execute a command in the current terminal Shell and return the output. Supports any bash/zsh/powershell commands.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute',
            },
            timeout: {
              type: 'number',
              description: 'Time to wait for output in milliseconds, default 2000. Increase for long-running commands',
            },
          },
          required: ['command'],
        },
      },
    }, async (args: { command: string; timeout?: number }, sessionId: string) => {
      return this.executeCommand(args.command, sessionId, args.timeout || 2000);
    });

    // read_terminal - Read terminal output
    this.registerTool('read_terminal', {
      type: 'function',
      function: {
        name: 'read_terminal',
        description: 'Read the current terminal output (last 50 lines), useful for understanding the terminal state.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    }, async (_args: any, sessionId: string) => {
      return this.readTerminal(sessionId);
    });
  }

  // ========== 工具执行器 ==========

  /**
   * 检测会话是否为 Windows 环境
   */
  private async isWindowsSession(sessionId: string): Promise<boolean> {
    if (!this.sshService) return false;
    try {
      const ctx = await this.sshService.getSystemContext(sessionId);
      return /OS:.*Windows|Shell:.*PowerShell|Shell:.*pwsh/i.test(ctx);
    } catch {
      return false;
    }
  }

  /**
   * 危险命令拦截：将 rm/Remove-Item 转换为移动到回收站，阻止极端破坏性操作
   */
  private async sanitizeCommand(command: string, sessionId: string): Promise<{ safe: boolean; rewritten?: string; reason?: string }> {
    const trimmed = command.trim();
    const isWin = await this.isWindowsSession(sessionId);

    if (isWin) {
      return this.sanitizeWindowsCommand(trimmed);
    }
    return this.sanitizeUnixCommand(trimmed);
  }

  /**
   * Unix (Linux/macOS) 命令安全检查
   */
  private sanitizeUnixCommand(trimmed: string): { safe: boolean; rewritten?: string; reason?: string } {
    // 绝对禁止的命令
    const blocked = [
      /^rm\s+(-[a-zA-Z]*\s+)*\/$/m,
      /^rm\s+(-[a-zA-Z]*\s+)*\/\s*$/m,
      /^rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+\/\s*$/m,
      /mkfs\./,
      /^dd\s+.*of=\/dev\/[sh]d/m,
      /^:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:/,
    ];
    for (const pattern of blocked) {
      if (pattern.test(trimmed)) {
        return { safe: false, reason: 'BLOCKED: Extremely dangerous destructive operation' };
      }
    }

    // rm 命令改写为移动到回收站
    const rmMatch = trimmed.match(/^(sudo\s+)?rm\s+((?:-[a-zA-Z]+\s+)*)(.+)$/s);
    if (rmMatch) {
      const sudo = rmMatch[1] || '';
      const targets = rmMatch[3].trim();
      const trashDir = '~/.aicmd/.trash';
      const ts = Date.now();
      const firstTarget = targets.split(/\s+/)[0];
      const rewritten = `${sudo}mkdir -p ${trashDir} && ${sudo}mv ${targets} ${trashDir}/_del_${ts}_$(basename ${firstTarget}) 2>/dev/null || ${sudo}mv ${targets} ${trashDir}/_del_${ts}`;
      return { safe: true, rewritten };
    }

    return { safe: true };
  }

  /**
   * Windows (PowerShell) 命令安全检查
   */
  private sanitizeWindowsCommand(trimmed: string): { safe: boolean; rewritten?: string; reason?: string } {
    const lower = trimmed.toLowerCase();

    // 绝对禁止的操作
    const blocked = [
      /format\s+[a-z]:/i,                            // format C:
      /clear-disk/i,                                   // Clear-Disk
      /remove-item\s+.*[a-z]:\\\s*$/i,               // Remove-Item C:\
      /remove-item\s+.*-recurse.*[a-z]:\\\s*$/i,     // Remove-Item -Recurse C:\
      /rd\s+\/s\s+[a-z]:\\\s*$/i,                    // rd /s C:\
    ];
    for (const pattern of blocked) {
      if (pattern.test(trimmed)) {
        return { safe: false, reason: 'BLOCKED: Extremely dangerous destructive operation' };
      }
    }

    // Remove-Item / del / rd 改写为移动到回收站
    const removePatterns = [
      /^(Remove-Item|ri|del|rd)\s+(.+)$/i,
    ];
    for (const pattern of removePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const targets = match[2]
          .replace(/-Recurse/gi, '')
          .replace(/-Force/gi, '')
          .replace(/-Confirm:\$false/gi, '')
          .replace(/\/s/gi, '')
          .replace(/\/q/gi, '')
          .trim();
        const trashDir = '$env:USERPROFILE\\.aicmd\\.trash';
        const ts = Date.now();
        const rewritten = `New-Item -ItemType Directory -Force -Path "${trashDir}" | Out-Null; Move-Item -Path ${targets} -Destination "${trashDir}\\_del_${ts}" -Force`;
        return { safe: true, rewritten };
      }
    }

    return { safe: true };
  }

  /**
   * 执行命令并捕获输出
   */
  private async executeCommand(command: string, sessionId: string, timeout: number): Promise<string> {
    if (!this.sshService) {
      return 'Error: SSH service not available';
    }
    const session = this.sshService.getSession(sessionId);
    if (!session) {
      return `Error: Session ${sessionId} not found`;
    }

    // Safety check: block/rewrite dangerous commands
    const check = await this.sanitizeCommand(command, sessionId);
    if (!check.safe) {
      return check.reason!;
    }
    const actualCommand = check.rewritten || command;
    if (check.rewritten) {
      console.log(`[AIService] Safety: rewrote "${command}" -> "${actualCommand}"`);
    }

    try {
      // Start output capture
      const outputPromise = this.sshService.captureOutput(sessionId, timeout);
      // Write command
      this.sshService.writeData(sessionId, actualCommand + '\n');
      // Wait for output
      const output = await outputPromise;

      // Clean output: remove command echo and whitespace
      const lines = output.split('\n');
      if (lines.length > 0 && lines[0].trim().includes(actualCommand.trim().substring(0, 20))) {
        lines.shift();
      }
      const cleanOutput = lines.join('\n').trim();

      if (!cleanOutput) {
        return '(Command executed, no output)';
      }

      // Limit output length
      const maxLength = 5000;
      if (cleanOutput.length > maxLength) {
        return cleanOutput.substring(0, maxLength) + `\n... (output truncated, ${cleanOutput.length} chars total)`;
      }

      return cleanOutput;
    } catch (error: any) {
      return `Command execution failed: ${error.message}`;
    }
  }

  /**
   * 读取终端当前输出
   */
  private async readTerminal(sessionId: string): Promise<string> {
    if (!this.sshService) {
      return 'Error: SSH service not available';
    }
    try {
      const output = await this.sshService.captureOutput(sessionId, 500);
      if (!output.trim()) {
        return '(No terminal output)';
      }
      const lines = output.split('\n').filter(l => l.trim());
      const last50 = lines.slice(-50);
      return last50.join('\n');
    } catch (error: any) {
      return `Failed to read terminal: ${error.message}`;
    }
  }

  // ========== 对话历史 ==========

  private getOrCreateHistory(sessionId: string): ChatHistory {
    let history = this.chatHistories.get(sessionId);
    if (!history) {
      history = { sessionId, messages: [], lastActive: Date.now() };
      this.chatHistories.set(sessionId, history);
    }
    history.lastActive = Date.now();
    return history;
  }

  private addMessage(history: ChatHistory, message: ChatMessage): void {
    history.messages.push(message);
    while (history.messages.length > this.MAX_MESSAGES) {
      history.messages.shift();
    }
  }

  clearHistory(sessionId: string): void {
    this.chatHistories.delete(sessionId);
    this.deleteDisplayHistoryFile(sessionId);
  }

  getHistory(sessionId: string): ChatMessage[] | null {
    const history = this.chatHistories.get(sessionId);
    return history ? [...history.messages] : null;
  }

  // ========== 对话历史持久化 ==========

  /**
   * 保存前端显示消息到文件（含元数据）
   */
  saveDisplayHistory(sessionId: string, displayMessages: DisplayMessage[], sessionName?: string): void {
    try {
      const filePath = path.join(this.historyDir, `${sessionId}.json`);
      const firstUser = displayMessages.find(m => m.role === 'user');
      const preview = firstUser ? (firstUser.content || '').substring(0, 80) : '';
      const fileData: HistoryFile = {
        meta: {
          sessionId,
          sessionName: sessionName || '',
          savedAt: Date.now(),
          messageCount: displayMessages.length,
          preview,
        },
        messages: displayMessages,
      };
      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
    } catch (error) {
      console.error('[AIService] Failed to save display history:', error);
    }
  }

  /**
   * 加载前端显示消息（兼容新旧格式）
   */
  loadDisplayHistory(sessionId: string): DisplayMessage[] | null {
    try {
      const filePath = path.join(this.historyDir, `${sessionId}.json`);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.messages)) {
        return data.messages;
      }
      if (Array.isArray(data)) return data;
      return null;
    } catch (error) {
      console.error('[AIService] Failed to load display history:', error);
      return null;
    }
  }

  /**
   * 列出所有历史对话（仅元数据）
   */
  listDisplayHistories(): HistoryMeta[] {
    const results: HistoryMeta[] = [];
    try {
      if (!fs.existsSync(this.historyDir)) return results;
      const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const filePath = path.join(this.historyDir, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (data?.meta) {
            results.push(data.meta);
          } else if (Array.isArray(data)) {
            // 兼容旧格式（纯数组）
            const sessionId = path.basename(file, '.json');
            const firstUser = data.find((m: any) => m.role === 'user');
            results.push({
              sessionId,
              sessionName: '',
              savedAt: fs.statSync(filePath).mtimeMs,
              messageCount: data.length,
              preview: firstUser ? (firstUser.content || '').substring(0, 80) : '',
            });
          }
        } catch (_) { /* 跳过损坏的文件 */ }
      }
    } catch (error) {
      console.error('[AIService] Failed to list histories:', error);
    }
    // 按保存时间倒序
    results.sort((a, b) => b.savedAt - a.savedAt);
    return results;
  }

  /**
   * 删除持久化的对话历史
   */
  deleteDisplayHistoryFile(sessionId: string): void {
    try {
      const filePath = path.join(this.historyDir, `${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('[AIService] Failed to delete display history:', error);
    }
  }

  // ========== 系统环境上下文 ==========

  /**
   * 获取会话的系统上下文（从 sshService 的 session 元数据获取）
   * 保证每次对话都带上系统环境信息
   */
  private async getSessionContext(sessionId: string): Promise<string> {
    if (!this.sshService) return '';
    try {
      return await this.sshService.getSystemContext(sessionId);
    } catch (error) {
      console.warn('[AIService] Failed to get system context:', error);
      return '';
    }
  }

  // ========== Agent 核心循环 ==========

  /**
   * 运行 Agent
   * Agent 循环：调用 LLM → 处理 tool_calls → 执行工具 → 反馈结果 → 重复直到完成
   */
  async agentRun(
    sessionId: string,
    userMessage: string,
    context: string | undefined,
    eventCallback: AgentEventCallback,
    skillId?: string,
    locale?: string
  ): Promise<void> {
    if (!this.config.apiKey) {
      eventCallback({ type: 'error', error: 'API Key not configured. Please set it in AI settings.' });
      return;
    }

    // Check for running agent
    const existingState = this.agentStates.get(sessionId);
    if (existingState?.running) {
      eventCallback({ type: 'error', error: 'Agent is already running. Please wait or stop it first.' });
      return;
    }

    // 设置运行状态
    const state: AgentRunState = { running: true, aborted: false };
    this.agentStates.set(sessionId, state);

    const history = this.getOrCreateHistory(sessionId);
    const tools = this.getToolDefinitions();

    // Build system prompt
    let systemPrompt = this.AGENT_SYSTEM_PROMPT;

    // Inject locale hint if provided (fallback when user language is ambiguous)
    if (locale) {
      const langName = locale.startsWith('zh') ? 'Chinese' : locale.startsWith('ja') ? 'Japanese' : locale.startsWith('ko') ? 'Korean' : 'English';
      systemPrompt += `\n\n[User's UI language preference: ${langName} (${locale}). If the user's message language is ambiguous, prefer responding in ${langName}.]`;
    }

    // Inject system environment context
    const sysContext = await this.getSessionContext(sessionId);
    if (sysContext && sysContext !== 'Failed to collect system info') {
      systemPrompt += `\n\n${sysContext}`;
    }

    // If Skill is provided, append Skill instructions
    if (skillId && this.skillService) {
      const skill = this.skillService.getSkill(skillId);
      if (skill) {
        systemPrompt += `\n\n## Current Task Instructions (Skill: ${skill.name})\n\n${skill.content}`;
      }
    }

    // 构建消息列表
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add terminal context
    if (context) {
      messages.push({
        role: 'system',
        content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\``,
      });
    }

    // 添加历史消息
    messages.push(...history.messages);

    // 添加用户消息
    const userMsg: ChatMessage = { role: 'user', content: userMessage };
    this.addMessage(history, userMsg);
    messages.push(userMsg);

    try {
      for (let iteration = 0; iteration < this.MAX_AGENT_ITERATIONS; iteration++) {
        // Check if aborted
        if (state.aborted) {
          eventCallback({ type: 'done', content: '(Agent stopped by user)' });
          break;
        }

        eventCallback({ type: 'thinking' });

        // 调用 LLM
        let response;
        try {
          response = await this.callLLM(messages, tools);
        } catch (error: any) {
          eventCallback({ type: 'error', error: `LLM call failed: ${error.message}` });
          break;
        }

        const assistantMessage = response.choices?.[0]?.message;
        if (!assistantMessage) {
          eventCallback({ type: 'error', error: 'LLM response is empty' });
          break;
        }

        // 添加 assistant 消息到历史
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: assistantMessage.content,
        };
        if (assistantMessage.tool_calls?.length) {
          assistantMsg.tool_calls = assistantMessage.tool_calls;
        }
        this.addMessage(history, assistantMsg);
        messages.push(assistantMsg);

        // 如果有文本内容，推送给用户
        if (assistantMessage.content) {
          eventCallback({ type: 'message', content: assistantMessage.content });
        }

        // 如果没有 tool_calls，Agent 完成
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          eventCallback({ type: 'done' });
          break;
        }

        // 处理 tool_calls
        for (const toolCall of assistantMessage.tool_calls) {
          if (state.aborted) break;

          const toolName = toolCall.function.name;
          let toolArgs: any = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            toolArgs = {};
          }

          // 推送工具调用事件
          eventCallback({ type: 'tool_call', tool: toolName, args: toolArgs });

          // 审计：记录工具调用开始时间
          const toolStartTime = Date.now();

          // 执行工具
          const tool = this.toolRegistry.get(toolName);
          let result: string;
          let toolStatus: AuditEntry['status'] = 'success';
          if (!tool) {
            result = `Error: Unknown tool "${toolName}"`;
            toolStatus = 'error';
          } else {
            try {
              result = await tool.executor(toolArgs, sessionId);
              if (result.startsWith('Error:') || result.startsWith('Tool execution failed:')) {
                toolStatus = 'error';
              }
            } catch (error: any) {
              result = `Tool execution failed: ${error.message}`;
              toolStatus = 'error';
            }
          }

          // 审计：记录工具执行结果
          if (this.auditService) {
            const command = toolName === 'execute_command' ? (toolArgs.command || '') : JSON.stringify(toolArgs);
            try {
              const auditEntry = this.auditService.log({
                sessionId,
                sessionName: this.sshService?.getSession(sessionId)?.name,
                connectionId: this.sshService?.getSession(sessionId)?.connectionId,
                userMessage,
                tool: toolName,
                command,
                result: result.substring(0, 5000), // 截断过长输出
                duration: Date.now() - toolStartTime,
                status: toolStatus,
              });
              // 推送审计事件给前端
              eventCallback({ type: 'audit_entry', auditEntry });
            } catch { /* 审计失败不影响主流程 */ }
          }

          // 推送工具结果事件
          eventCallback({ type: 'tool_result', tool: toolName, result });

          // 添加工具结果到消息列表
          const toolMsg: ChatMessage = {
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          };
          messages.push(toolMsg);
          this.addMessage(history, toolMsg);
        }

        // Last iteration with remaining tool_calls
        if (iteration === this.MAX_AGENT_ITERATIONS - 1) {
          eventCallback({ type: 'done', content: 'Max iterations reached' });
        }
      }
    } catch (error: any) {
      eventCallback({ type: 'error', error: error.message || 'Agent runtime error' });
    } finally {
      state.running = false;
      this.agentStates.delete(sessionId);
    }
  }

  /**
   * 停止 Agent
   */
  stopAgent(sessionId: string): boolean {
    const state = this.agentStates.get(sessionId);
    if (state?.running) {
      state.aborted = true;
      return true;
    }
    return false;
  }

  /**
   * 调用 OpenAI API（非流式，用于 Agent 循环）
   */
  private async callLLM(messages: ChatMessage[], tools: ToolDefinition[]): Promise<any> {
    const requestBody: any = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens || 4000,
      temperature: this.config.temperature || 0.3,
    };

    // 只有注册了工具才传 tools 参数
    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    const response = await axios.post(
      `${this.config.baseUrl}/chat/completions`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000, // Agent 需要更长的超时
      }
    );

    return response.data;
  }

  // ========== 旧版兼容（非 Agent 模式的简单对话） ==========

  async chat(sessionId: string, userMessage: string, context?: string): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('API Key not configured. Please set it in AI settings.');
    }

    const history = this.getOrCreateHistory(sessionId);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.AGENT_SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\``,
      });
    }

    messages.push(...history.messages);
    this.addMessage(history, { role: 'user', content: userMessage });
    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await axios.post(
        `${this.config.baseUrl}/chat/completions`,
        {
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens || 4000,
          temperature: this.config.temperature || 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const assistantMessage = response.data?.choices?.[0]?.message?.content;
      if (assistantMessage) {
        this.addMessage(history, { role: 'assistant', content: assistantMessage });
        return assistantMessage;
      }
      throw new Error('AI response is empty');
    } catch (error: any) {
      history.messages.pop();
      const message = error.response?.data?.error?.message || error.message || 'AI request failed';
      throw new Error(message);
    }
  }

  async *chatStream(
    sessionId: string,
    userMessage: string,
    context?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.config.apiKey) {
      throw new Error('API Key not configured. Please set it in AI settings.');
    }

    const history = this.getOrCreateHistory(sessionId);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.AGENT_SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\``,
      });
    }

    messages.push(...history.messages);
    this.addMessage(history, { role: 'user', content: userMessage });
    messages.push({ role: 'user', content: userMessage });

    let fullResponse = '';
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/chat/completions`,
        {
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens || 4000,
          temperature: this.config.temperature || 0.3,
          stream: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 60000,
        }
      );

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                yield content;
              }
            } catch { /* ignore */ }
          }
        }
      }

      if (fullResponse) {
        this.addMessage(history, { role: 'assistant', content: fullResponse });
      }
    } catch (error: any) {
      history.messages.pop();
      const message = error.response?.data?.error?.message || error.message || 'AI request failed';
      throw new Error(message);
    }
  }
}
