import { AuditService } from './audit.service';
import type { Message, ToolDefinition } from '@cicctencent/agent-core';
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
interface ISSHService {
    writeData(sessionId: string, data: string | Buffer): boolean;
    captureOutput(sessionId: string, timeoutMs?: number): Promise<string>;
    getSession(sessionId: string): any;
    getSystemContext(sessionId: string): Promise<string>;
}
interface ISkillService {
    getSkill(id: string): {
        name: string;
        content: string;
    } | undefined;
}
export declare class AIService {
    private configDir;
    private configPath;
    private config;
    private historyDir;
    private messagesDir;
    private llmProvider?;
    private toolRegistry;
    private contextManager;
    private securityGuard;
    private engine?;
    private abortControllers;
    private loadedSessions;
    private sshService?;
    private skillService?;
    private auditService?;
    private readonly MAX_MESSAGES;
    private readonly MAX_AGENT_ITERATIONS;
    constructor(sshService?: ISSHService, skillService?: ISkillService, auditService?: AuditService);
    private ensureLLMProvider;
    private resetProviderAndEngine;
    private getEngine;
    private buildHooks;
    private getDefaultConfig;
    private loadConfig;
    private saveConfig;
    private encryptConfig;
    private decryptConfig;
    private getEncryptionKey;
    private encryptSecret;
    private decryptSecret;
    getConfig(): AIConfig;
    getFullConfig(): AIConfig;
    updateConfig(updates: Partial<AIConfig>): AIConfig;
    testConfig(config?: Partial<AIConfig>): Promise<{
        success: boolean;
        message: string;
    }>;
    registerTool(name: string, definition: ToolDefinition, executor: ToolExecutor): void;
    getToolDefinitions(): ToolDefinition[];
    private registerBuiltinTools;
    private isWindowsSession;
    private sanitizeCommand;
    private sanitizeWindowsCommand;
    private executeCommand;
    private readTerminal;
    private getSessionContext;
    private mapCoreEvent;
    agentRun(sessionId: string, userMessage: string, context: string | undefined, eventCallback: AgentEventCallback, skillId?: string, locale?: string): Promise<void>;
    stopAgent(sessionId: string): boolean;
    chat(sessionId: string, userMessage: string, context?: string): Promise<string>;
    chatStream(sessionId: string, userMessage: string, context?: string): AsyncGenerator<string, void, unknown>;
    clearHistory(sessionId: string): void;
    getHistory(sessionId: string): Message[] | null;
    private saveChatMessages;
    private loadChatMessages;
    private deleteChatMessagesFile;
    saveDisplayHistory(sessionId: string, displayMessages: DisplayMessage[], sessionName?: string): void;
    loadDisplayHistory(sessionId: string): DisplayMessage[] | null;
    listDisplayHistories(): HistoryMeta[];
    deleteDisplayHistoryFile(sessionId: string): void;
}
export {};
//# sourceMappingURL=ai.service.d.ts.map