"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
const data_dir_1 = require("../utils/data-dir");
const shell_1 = require("../utils/shell");
const agent_core_1 = require("@cicctencent/agent-core");
const agent_core_2 = require("@cicctencent/agent-core");
const ENCRYPTED_PREFIX = 'enc:v1:';
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
class AIService {
    // ---- 配置 & 持久化 ----
    configDir;
    configPath;
    config;
    historyDir;
    messagesDir;
    // ---- agent-core 组件 ----
    llmProvider;
    toolRegistry;
    contextManager;
    securityGuard;
    engine;
    abortControllers = new Map();
    // ---- 状态 ----
    loadedSessions = new Set();
    sshService;
    skillService;
    auditService;
    MAX_MESSAGES = 50;
    MAX_AGENT_ITERATIONS = 15;
    constructor(sshService, skillService, auditService) {
        this.configDir = (0, data_dir_1.getDataDir)();
        this.configPath = (0, data_dir_1.getDataPath)('ai-config.json');
        this.historyDir = (0, data_dir_1.getDataPath)('ai-history');
        this.messagesDir = path.resolve('data', 'messages');
        this.config = this.getDefaultConfig();
        this.sshService = sshService;
        this.skillService = skillService;
        this.auditService = auditService;
        // 初始化 agent-core 组件
        this.toolRegistry = new agent_core_1.ToolRegistry();
        this.contextManager = new agent_core_1.ContextManager();
        this.securityGuard = new agent_core_1.SecurityGuard({
            trashDir: '~/.aicmd/.trash',
            deleteProtection: true,
        });
        // agent-core 0.1.4 已内置 Windows 黑名单（format C:, clear-disk, rd /s, Remove-Item drive root）
        // 无需再手动添加
        this.loadConfig();
        try {
            if (!fs.existsSync(this.historyDir))
                fs.mkdirSync(this.historyDir, { recursive: true });
        }
        catch (_) { /* ignore */ }
        (0, data_dir_1.ensureDir)(this.messagesDir);
        this.registerBuiltinTools();
    }
    // ========== LLM Provider & Engine 懒初始化 ==========
    ensureLLMProvider() {
        if (!this.config.apiKey)
            return undefined;
        if (!this.llmProvider) {
            this.llmProvider = (0, agent_core_1.createLLMProvider)({
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
    resetProviderAndEngine() {
        this.llmProvider = undefined;
        this.engine = undefined;
    }
    getEngine() {
        const provider = this.ensureLLMProvider();
        if (!provider)
            return undefined;
        if (!this.engine) {
            this.engine = new agent_core_1.AgentEngine({
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
    buildHooks() {
        if (!this.auditService)
            return [];
        const auditService = this.auditService;
        const sshService = this.sshService;
        return [{
                name: 'audit-tool-call',
                event: 'after_tool',
                handler: async (ctx) => {
                    try {
                        const command = ctx.tool === 'execute_command'
                            ? (ctx.args?.command || '')
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
                    }
                    catch { /* 审计失败不影响主流程 */ }
                },
            }];
    }
    // ========== 配置管理 ==========
    getDefaultConfig() {
        return {
            enabled: true, provider: 'openai', apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini', maxTokens: 4000, temperature: 0.3,
        };
    }
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                const savedConfig = this.decryptConfig(JSON.parse(data));
                this.config = { ...this.getDefaultConfig(), ...savedConfig };
            }
        }
        catch (error) {
            console.error('[AIService] Failed to load config:', error);
        }
    }
    saveConfig() {
        try {
            if (!fs.existsSync(this.configDir))
                fs.mkdirSync(this.configDir, { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(this.encryptConfig(this.config), null, 2), { encoding: 'utf-8', mode: 0o600 });
            try {
                fs.chmodSync(this.configPath, 0o600);
            }
            catch (_) { /* ignore */ }
        }
        catch (error) {
            console.error('[AIService] Failed to save config:', error);
            throw error;
        }
    }
    encryptConfig(config) {
        const encrypted = { ...config };
        if (encrypted.apiKey && !encrypted.apiKey.startsWith(ENCRYPTED_PREFIX)) {
            encrypted.apiKey = this.encryptSecret(encrypted.apiKey);
        }
        return encrypted;
    }
    decryptConfig(config) {
        const decrypted = { ...config };
        if (typeof decrypted.apiKey === 'string' && decrypted.apiKey.startsWith(ENCRYPTED_PREFIX)) {
            decrypted.apiKey = this.decryptSecret(decrypted.apiKey);
        }
        return decrypted;
    }
    getEncryptionKey() {
        const keyPath = (0, data_dir_1.getDataPath)('ai-config.key');
        try {
            if (fs.existsSync(keyPath)) {
                return crypto.createHash('sha256').update(fs.readFileSync(keyPath, 'utf8').trim()).digest();
            }
            const secret = crypto.randomBytes(32).toString('base64url');
            fs.writeFileSync(keyPath, secret, { encoding: 'utf8', mode: 0o600 });
            try {
                fs.chmodSync(keyPath, 0o600);
            }
            catch (_) { /* ignore */ }
            return crypto.createHash('sha256').update(secret).digest();
        }
        catch (error) {
            console.warn(`[AIService] Failed to load encryption key: ${error.message}`);
            return crypto.createHash('sha256').update(`${os.hostname()}:${os.homedir()}:aicmd-ai`).digest();
        }
    }
    encryptSecret(value) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
    }
    decryptSecret(value) {
        try {
            const payload = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
            const iv = payload.subarray(0, 12);
            const tag = payload.subarray(12, 28);
            const encrypted = payload.subarray(28);
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        }
        catch (error) {
            console.warn(`[AIService] Failed to decrypt API key: ${error.message}`);
            return '';
        }
    }
    // ========== 公共配置 API ==========
    getConfig() {
        const maskedConfig = { ...this.config };
        if (maskedConfig.apiKey) {
            const key = maskedConfig.apiKey;
            maskedConfig.apiKey = key.substring(0, 8) + '****' + key.substring(key.length - 4);
        }
        return maskedConfig;
    }
    getFullConfig() { return { ...this.config }; }
    updateConfig(updates) {
        // 如果传入的 apiKey 是掩码值（包含 ****），则保留原有的真实 apiKey
        if (updates.apiKey && updates.apiKey.includes('****')) {
            delete updates.apiKey;
        }
        this.config = { ...this.config, ...updates };
        this.saveConfig();
        this.resetProviderAndEngine();
        return this.getConfig();
    }
    async testConfig(config) {
        const testCfg = { ...this.config, ...config };
        if (!testCfg.apiKey)
            return { success: false, message: 'API Key not configured' };
        try {
            const provider = (0, agent_core_1.createLLMProvider)({
                provider: testCfg.provider || 'openai', model: testCfg.model,
                apiKey: testCfg.apiKey, baseUrl: testCfg.baseUrl,
            });
            const ok = await provider.ping();
            return ok
                ? { success: true, message: 'Connection successful, model available' }
                : { success: false, message: 'Connection failed or model unavailable' };
        }
        catch (error) {
            return { success: false, message: error.message || 'Connection failed' };
        }
    }
    // ========== 工具注册 ==========
    registerTool(name, definition, executor) {
        this.toolRegistry.register({
            definition,
            executor: (args, _ctx) => executor(args, _ctx.sessionId),
            category: 'custom',
        });
        console.log(`[AIService] Tool registered: ${name}`);
    }
    getToolDefinitions() {
        return this.toolRegistry.getDefinitions();
    }
    registerBuiltinTools() {
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
            executor: async (args, ctx) => {
                return this.executeCommand(args.command, ctx.sessionId, args.timeout || 2000);
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
            executor: async (_args, ctx) => {
                return this.readTerminal(ctx.sessionId);
            },
            category: 'builtin',
        });
    }
    // ========== 命令安全检查 ==========
    async isWindowsSession(sessionId) {
        if (!this.sshService)
            return false;
        try {
            const ctx = await this.sshService.getSystemContext(sessionId);
            return /OS:.*Windows|Shell:.*PowerShell|Shell:.*pwsh/i.test(ctx);
        }
        catch {
            return false;
        }
    }
    async sanitizeCommand(command, sessionId) {
        const trimmed = command.trim();
        const risk = (0, shell_1.assessDangerousCommand)(trimmed);
        if (!risk.safe)
            return risk;
        const isWin = await this.isWindowsSession(sessionId);
        return isWin ? this.sanitizeWindowsCommand(trimmed) : { safe: true };
    }
    sanitizeWindowsCommand(trimmed) {
        const blocked = [
            /format\s+[a-z]:/i, /clear-disk/i,
            /remove-item\s+.*[a-z]:\s*$/i, /remove-item\s+.*-recurse.*[a-z]:\s*$/i,
            /rd\s+\/s\s+[a-z]:\s*$/i,
        ];
        for (const pattern of blocked) {
            if (pattern.test(trimmed))
                return { safe: false, reason: 'BLOCKED: Extremely dangerous destructive operation' };
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
    async executeCommand(command, sessionId, timeout) {
        if (!this.sshService)
            return 'Error: SSH service not available';
        const session = this.sshService.getSession(sessionId);
        if (!session)
            return `Error: Session ${sessionId} not found`;
        const check = await this.sanitizeCommand(command, sessionId);
        if (!check.safe)
            return check.reason;
        const actualCommand = check.rewritten || command;
        if (check.rewritten)
            console.log(`[AIService] Safety: rewrote "${command}" -> "${actualCommand}"`);
        try {
            const outputPromise = this.sshService.captureOutput(sessionId, timeout);
            this.sshService.writeData(sessionId, actualCommand + '\n');
            const output = await outputPromise;
            const lines = output.split('\n');
            if (lines.length > 0 && lines[0].trim().includes(actualCommand.trim().substring(0, 20)))
                lines.shift();
            const cleanOutput = lines.join('\n').trim();
            if (!cleanOutput)
                return '(Command executed, no output)';
            const maxLength = 5000;
            if (cleanOutput.length > maxLength) {
                return cleanOutput.substring(0, maxLength) + `\n... (output truncated, ${cleanOutput.length} chars total)`;
            }
            return cleanOutput;
        }
        catch (error) {
            return `Command execution failed: ${error.message}`;
        }
    }
    async readTerminal(sessionId) {
        if (!this.sshService)
            return 'Error: SSH service not available';
        try {
            const output = await this.sshService.captureOutput(sessionId, 500);
            if (!output.trim())
                return '(No terminal output)';
            return output.split('\n').filter(l => l.trim()).slice(-50).join('\n');
        }
        catch (error) {
            return `Failed to read terminal: ${error.message}`;
        }
    }
    // ========== 系统环境上下文 ==========
    async getSessionContext(sessionId) {
        if (!this.sshService)
            return '';
        try {
            return await this.sshService.getSystemContext(sessionId);
        }
        catch (error) {
            console.warn('[AIService] Failed to get system context:', error);
            return '';
        }
    }
    // ========== Core → App 事件映射 ==========
    mapCoreEvent(event) {
        switch (event.type) {
            case 'thinking': return { type: 'thinking', content: event.content };
            case 'tool_call': return { type: 'tool_call', tool: event.tool, args: event.args };
            case 'tool_result': return { type: 'tool_result', tool: event.tool, result: event.result };
            case 'message': return { type: 'message', content: event.content };
            case 'done': return { type: 'done', content: event.content };
            case 'error': return { type: 'error', error: event.error };
            default: return null;
        }
    }
    // ========== Agent 核心循环 ==========
    async agentRun(sessionId, userMessage, context, eventCallback, skillId, locale) {
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
                if (mapped)
                    eventCallback(mapped);
            }
        }
        catch (error) {
            eventCallback({ type: 'error', error: error.message || 'Agent runtime error' });
        }
        finally {
            this.abortControllers.delete(sessionId);
            // 持久化 LLM 上下文消息
            try {
                const snapshot = engine.getHistorySnapshot(sessionId);
                if (snapshot && snapshot.length > 0)
                    this.saveChatMessages(sessionId, snapshot);
            }
            catch { /* ignore */ }
        }
    }
    stopAgent(sessionId) {
        const ctrl = this.abortControllers.get(sessionId);
        if (ctrl) {
            ctrl.abort();
            this.engine?.abort(sessionId);
            return true;
        }
        return false;
    }
    // ========== 非 Agent 对话 ==========
    async chat(sessionId, userMessage, context) {
        const provider = this.ensureLLMProvider();
        if (!provider)
            throw new Error('API Key not configured. Please set it in AI settings.');
        const history = this.loadChatMessages(sessionId) || [];
        const messages = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }];
        if (context)
            messages.push({ role: 'system', content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\`` });
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
                const textContent = (0, agent_core_2.extractTextFromContent)(content);
                history.push({ role: 'assistant', content: textContent });
                this.saveChatMessages(sessionId, history);
                return textContent;
            }
            throw new Error('AI response is empty');
        }
        catch (error) {
            history.pop();
            throw new Error(error.response?.data?.error?.message || error.message || 'AI request failed');
        }
    }
    async *chatStream(sessionId, userMessage, context) {
        const provider = this.ensureLLMProvider();
        if (!provider)
            throw new Error('API Key not configured. Please set it in AI settings.');
        const history = this.loadChatMessages(sessionId) || [];
        const messages = [{ role: 'system', content: AGENT_SYSTEM_PROMPT }];
        if (context)
            messages.push({ role: 'system', content: `Recent terminal output:\n\`\`\`\n${context}\n\`\`\`` });
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
                    const textContent = (0, agent_core_2.extractTextFromContent)(content);
                    fullResponse += textContent;
                    yield textContent;
                }
            }
            if (fullResponse) {
                history.push({ role: 'assistant', content: fullResponse });
                this.saveChatMessages(sessionId, history);
            }
        }
        catch (error) {
            history.pop();
            throw new Error(error.response?.data?.error?.message || error.message || 'AI request failed');
        }
    }
    // ========== LLM 上下文消息持久化 ==========
    clearHistory(sessionId) {
        this.loadedSessions.delete(sessionId);
        this.deleteDisplayHistoryFile(sessionId);
        this.deleteChatMessagesFile(sessionId);
        this.engine?.setHistory(sessionId, []);
    }
    getHistory(sessionId) {
        return this.loadChatMessages(sessionId);
    }
    saveChatMessages(sessionId, messages) {
        try {
            (0, data_dir_1.ensureDir)(this.messagesDir);
            const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = path.join(this.messagesDir, `${safe}.json`);
            fs.writeFileSync(filePath, JSON.stringify({ sessionId, updatedAt: Date.now(), messages }, null, 2), 'utf-8');
        }
        catch { /* 静默失败 */ }
    }
    loadChatMessages(sessionId) {
        try {
            if (!fs.existsSync(this.messagesDir))
                return null;
            const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = path.join(this.messagesDir, `${safe}.json`);
            if (!fs.existsSync(filePath))
                return null;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (data && Array.isArray(data.messages))
                return data.messages.slice(-this.MAX_MESSAGES);
            return null;
        }
        catch {
            return null;
        }
    }
    deleteChatMessagesFile(sessionId) {
        try {
            const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = path.join(this.messagesDir, `${safe}.json`);
            if (fs.existsSync(filePath))
                fs.unlinkSync(filePath);
        }
        catch { /* 静默失败 */ }
    }
    // ========== 对话历史持久化（前端显示） ==========
    saveDisplayHistory(sessionId, displayMessages, sessionName) {
        try {
            const filePath = path.join(this.historyDir, `${sessionId}.json`);
            const firstUser = displayMessages.find(m => m.role === 'user');
            const preview = firstUser ? (firstUser.content || '').substring(0, 80) : '';
            const fileData = {
                meta: { sessionId, sessionName: sessionName || '', savedAt: Date.now(), messageCount: displayMessages.length, preview },
                messages: displayMessages,
            };
            fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('[AIService] Failed to save display history:', error);
        }
    }
    loadDisplayHistory(sessionId) {
        try {
            const filePath = path.join(this.historyDir, `${sessionId}.json`);
            if (!fs.existsSync(filePath))
                return null;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (data && Array.isArray(data.messages))
                return data.messages;
            if (Array.isArray(data))
                return data;
            return null;
        }
        catch {
            return null;
        }
    }
    listDisplayHistories() {
        const results = [];
        try {
            if (!fs.existsSync(this.historyDir))
                return results;
            const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const fp = path.join(this.historyDir, file);
                    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
                    if (data?.meta) {
                        results.push(data.meta);
                    }
                    else if (Array.isArray(data)) {
                        const sid = path.basename(file, '.json');
                        const firstUser = data.find((m) => m.role === 'user');
                        results.push({
                            sessionId: sid, sessionName: '',
                            savedAt: fs.statSync(fp).mtimeMs,
                            messageCount: data.length,
                            preview: firstUser ? (firstUser.content || '').substring(0, 80) : '',
                        });
                    }
                }
                catch { /* 跳过损坏的文件 */ }
            }
        }
        catch (error) {
            console.error('[AIService] Failed to list histories:', error);
        }
        results.sort((a, b) => b.savedAt - a.savedAt);
        return results;
    }
    deleteDisplayHistoryFile(sessionId) {
        try {
            const filePath = path.join(this.historyDir, `${sessionId}.json`);
            if (fs.existsSync(filePath))
                fs.unlinkSync(filePath);
            this.deleteChatMessagesFile(sessionId);
            this.loadedSessions.delete(sessionId);
        }
        catch (error) {
            console.error('[AIService] Failed to delete display history:', error);
        }
    }
}
exports.AIService = AIService;
//# sourceMappingURL=ai.service.js.map