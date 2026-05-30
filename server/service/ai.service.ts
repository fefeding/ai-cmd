import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';

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
export type AgentEventType = 'thinking' | 'message' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'system_info';

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
  private readonly MAX_HISTORY_AGE = 24 * 60 * 60 * 1000;
  private readonly MAX_MESSAGES = 50;
  private readonly MAX_AGENT_ITERATIONS = 15;

  // Agent 系统提示词
  private readonly AGENT_SYSTEM_PROMPT = `你是一个强大的 AI 终端 Agent，可以直接操作用户的终端 Shell。

你的能力：
1. 通过 execute_command 工具直接在终端执行命令
2. 通过 read_terminal 工具读取终端当前输出
3. 理解命令执行结果并据此做出决策
4. 自动完成多步骤任务

工作原则：
1. **直接行动**：当用户要求执行操作时，直接使用工具执行，不要只是建议命令
2. **验证结果**：执行命令后，检查输出确认是否成功
3. **安全第一**：对于危险操作（rm -rf、格式化等），在 content 中先说明风险，让用户确认后再执行
4. **分步执行**：复杂任务分步完成，每步执行后检查结果
5. **错误处理**：如果命令失败，分析原因并尝试修复或使用替代方案

回复格式：
- 使用 Markdown 格式
- 在每次工具调用前，简要说明你要做什么
- 任务完成后，总结执行结果
- 使用中文回复`;

  constructor(sshService?: ISSHService, skillService?: ISkillService) {
    this.configDir = path.join(os.homedir(), '.fterm');
    this.configPath = path.join(this.configDir, 'ai-config.json');
    this.historyDir = path.join(this.configDir, 'ai-history');
    this.config = this.getDefaultConfig();
    this.sshService = sshService;
    this.skillService = skillService;
    this.loadConfig();
    // 确保历史目录存在
    try { if (!fs.existsSync(this.historyDir)) fs.mkdirSync(this.historyDir, { recursive: true }); } catch (_) { /* ignore */ }
    this.cleanupOldHistories();
    this.registerBuiltinTools();
  }

  private getDefaultConfig(): AIConfig {
    return {
      enabled: false,
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
      return { success: false, message: 'API Key 未配置' };
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
        return { success: true, message: '连接成功，模型可用' };
      }
      return { success: false, message: '响应格式异常' };
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.message || '连接失败';
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
    // execute_command - 执行 shell 命令
    this.registerTool('execute_command', {
      type: 'function',
      function: {
        name: 'execute_command',
        description: '在当前终端 Shell 中执行命令并返回输出。支持任意 bash/zsh 命令。',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的 shell 命令',
            },
            timeout: {
              type: 'number',
              description: '等待输出的时间（毫秒），默认 2000，对于耗时命令可以设大一些',
            },
          },
          required: ['command'],
        },
      },
    }, async (args: { command: string; timeout?: number }, sessionId: string) => {
      return this.executeCommand(args.command, sessionId, args.timeout || 2000);
    });

    // read_terminal - 读取终端输出
    this.registerTool('read_terminal', {
      type: 'function',
      function: {
        name: 'read_terminal',
        description: '读取终端当前的输出内容（最近 50 行），用于了解终端当前状态。',
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
   * 执行命令并捕获输出
   */
  private async executeCommand(command: string, sessionId: string, timeout: number): Promise<string> {
    if (!this.sshService) {
      return '错误: SSH 服务不可用';
    }
    const session = this.sshService.getSession(sessionId);
    if (!session) {
      return `错误: 会话 ${sessionId} 不存在`;
    }

    try {
      // 启动输出捕获
      const outputPromise = this.sshService.captureOutput(sessionId, timeout);
      // 写入命令
      this.sshService.writeData(sessionId, command + '\n');
      // 等待输出
      const output = await outputPromise;

      // 清理输出：去除命令回显和空白
      const lines = output.split('\n');
      // 尝试去掉第一行的命令回显
      if (lines.length > 0 && lines[0].trim().includes(command.trim().substring(0, 20))) {
        lines.shift();
      }
      const cleanOutput = lines.join('\n').trim();

      if (!cleanOutput) {
        return '(命令执行完成，无输出)';
      }

      // 限制输出长度，避免过长
      const maxLength = 5000;
      if (cleanOutput.length > maxLength) {
        return cleanOutput.substring(0, maxLength) + `\n... (输出被截断，共 ${cleanOutput.length} 字符)`;
      }

      return cleanOutput;
    } catch (error: any) {
      return `执行命令失败: ${error.message}`;
    }
  }

  /**
   * 读取终端当前输出
   */
  private async readTerminal(sessionId: string): Promise<string> {
    if (!this.sshService) {
      return '错误: SSH 服务不可用';
    }
    try {
      // 短暂捕获以获取当前缓冲区内容
      const output = await this.sshService.captureOutput(sessionId, 500);
      if (!output.trim()) {
        return '(终端当前无输出)';
      }
      const lines = output.split('\n').filter(l => l.trim());
      // 返回最后 50 行
      const last50 = lines.slice(-50);
      return last50.join('\n');
    } catch (error: any) {
      return `读取终端失败: ${error.message}`;
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
    skillId?: string
  ): Promise<void> {
    if (!this.config.enabled || !this.config.apiKey) {
      eventCallback({ type: 'error', error: 'AI 功能未启用或未配置 API Key' });
      return;
    }

    // 检查是否有正在运行的 agent
    const existingState = this.agentStates.get(sessionId);
    if (existingState?.running) {
      eventCallback({ type: 'error', error: 'Agent 正在运行中，请先等待完成或停止' });
      return;
    }

    // 设置运行状态
    const state: AgentRunState = { running: true, aborted: false };
    this.agentStates.set(sessionId, state);

    const history = this.getOrCreateHistory(sessionId);
    const tools = this.getToolDefinitions();

    // 构建系统提示词
    let systemPrompt = this.AGENT_SYSTEM_PROMPT;

    // 自动注入系统环境上下文（首次对话自动采集）
    const sysContext = await this.getSessionContext(sessionId);
    if (sysContext && sysContext !== '无法采集系统信息') {
      systemPrompt += `\n\n${sysContext}`;
    }

    // 如果有 Skill，追加 Skill 指令
    if (skillId && this.skillService) {
      const skill = this.skillService.getSkill(skillId);
      if (skill) {
        systemPrompt += `\n\n## 当前任务指令（Skill: ${skill.name}）\n\n${skill.content}`;
      }
    }

    // 构建消息列表
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 添加终端上下文
    if (context) {
      messages.push({
        role: 'system',
        content: `当前终端最近的输出内容：\n\`\`\`\n${context}\n\`\`\``,
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
        // 检查是否被中断
        if (state.aborted) {
          eventCallback({ type: 'done', content: '(Agent 已被用户中断)' });
          break;
        }

        eventCallback({ type: 'thinking' });

        // 调用 LLM
        let response;
        try {
          response = await this.callLLM(messages, tools);
        } catch (error: any) {
          eventCallback({ type: 'error', error: `LLM 调用失败: ${error.message}` });
          break;
        }

        const assistantMessage = response.choices?.[0]?.message;
        if (!assistantMessage) {
          eventCallback({ type: 'error', error: 'LLM 响应为空' });
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

          // 执行工具
          const tool = this.toolRegistry.get(toolName);
          let result: string;
          if (!tool) {
            result = `错误: 未知工具 "${toolName}"`;
          } else {
            try {
              result = await tool.executor(toolArgs, sessionId);
            } catch (error: any) {
              result = `工具执行失败: ${error.message}`;
            }
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

        // 如果是最后一次迭代且仍有 tool_calls，发送完成
        if (iteration === this.MAX_AGENT_ITERATIONS - 1) {
          eventCallback({ type: 'done', content: '已达到最大执行次数限制' });
        }
      }
    } catch (error: any) {
      eventCallback({ type: 'error', error: error.message || 'Agent 运行异常' });
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
    if (!this.config.enabled || !this.config.apiKey) {
      throw new Error('AI 功能未启用或未配置 API Key');
    }

    const history = this.getOrCreateHistory(sessionId);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.AGENT_SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `当前终端最近的输出内容：\n\`\`\`\n${context}\n\`\`\``,
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
      throw new Error('AI 响应为空');
    } catch (error: any) {
      history.messages.pop();
      const message = error.response?.data?.error?.message || error.message || 'AI 请求失败';
      throw new Error(message);
    }
  }

  async *chatStream(
    sessionId: string,
    userMessage: string,
    context?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.config.enabled || !this.config.apiKey) {
      throw new Error('AI 功能未启用或未配置 API Key');
    }

    const history = this.getOrCreateHistory(sessionId);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.AGENT_SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `当前终端最近的输出内容：\n\`\`\`\n${context}\n\`\`\``,
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
      const message = error.response?.data?.error?.message || error.message || 'AI 请求失败';
      throw new Error(message);
    }
  }
}
