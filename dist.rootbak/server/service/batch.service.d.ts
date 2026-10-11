import { SSHService } from './ssh.service';
import { ConnectionService } from './connection.service';
/**
 * 批量操作结果
 */
export interface BatchResult {
    sessionId: string;
    connectionId: string;
    sessionName: string;
    success: boolean;
    output: string;
    duration: number;
    error?: string;
}
/**
 * 批量操作任务
 */
export interface BatchTask {
    id: string;
    command: string;
    sessionIds: string[];
    results: BatchResult[];
    status: 'running' | 'completed' | 'failed';
    startedAt: number;
    completedAt?: number;
}
/**
 * 批量操作事件回调
 */
export type BatchEventCallback = (event: {
    type: 'batch-progress' | 'batch-result' | 'batch-complete';
    taskId: string;
    sessionId?: string;
    result?: BatchResult;
    completed?: number;
    total?: number;
}) => void;
/**
 * 批量操作服务
 * 支持同时在多个服务器上执行相同命令
 */
export declare class BatchService {
    private sshService;
    private connectionService;
    private tasks;
    private eventCallback;
    constructor(sshService: SSHService, connectionService: ConnectionService);
    /**
     * 注册事件回调
     */
    onEvent(callback: BatchEventCallback): void;
    /**
     * 执行批量命令
     */
    executeBatch(sessionIds: string[], command: string, timeout?: number): Promise<BatchTask>;
    /**
     * 获取批量任务结果
     */
    getTask(taskId: string): BatchTask | null;
    /**
     * 获取所有批量任务
     */
    getTasks(limit?: number): BatchTask[];
    /**
     * 清理旧任务
     */
    cleanupOldTasks(maxAge?: number): void;
    /**
     * 在单个会话上执行命令
     */
    private executeOnSession;
    /**
     * 发射事件
     */
    private emitEvent;
}
//# sourceMappingURL=batch.service.d.ts.map