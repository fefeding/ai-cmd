import { SSHService } from './ssh.service';
import { ConnectionService } from './connection.service';
import { assessDangerousCommand } from '../utils/shell';

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
export class BatchService {
  private sshService: SSHService;
  private connectionService: ConnectionService;
  private tasks: Map<string, BatchTask> = new Map();
  private eventCallback: BatchEventCallback | null = null;

  constructor(sshService: SSHService, connectionService: ConnectionService) {
    this.sshService = sshService;
    this.connectionService = connectionService;
  }

  /**
   * 注册事件回调
   */
  onEvent(callback: BatchEventCallback) {
    this.eventCallback = callback;
  }

  /**
   * 执行批量命令
   */
  async executeBatch(
    sessionIds: string[],
    command: string,
    timeout: number = 10000,
  ): Promise<BatchTask> {
    const risk = assessDangerousCommand(command);
    if (!risk.safe) {
      throw new Error(risk.reason || 'Blocked high-risk command');
    }
    const taskId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const task: BatchTask = {
      id: taskId,
      command,
      sessionIds,
      results: [],
      status: 'running',
      startedAt: Date.now(),
    };
    this.tasks.set(taskId, task);

    // 并行执行
    const promises = sessionIds.map(async (sessionId) => {
      const result = await this.executeOnSession(sessionId, command, timeout);
      task.results.push(result);

      // 发射进度事件
      this.emitEvent({
        type: 'batch-result',
        taskId,
        sessionId,
        result,
        completed: task.results.length,
        total: sessionIds.length,
      });

      return result;
    });

    try {
      await Promise.allSettled(promises);
      task.status = 'completed';
      task.completedAt = Date.now();

      this.emitEvent({
        type: 'batch-complete',
        taskId,
        completed: task.results.length,
        total: sessionIds.length,
      });
    } catch (e: any) {
      task.status = 'failed';
      task.completedAt = Date.now();
    }

    return task;
  }

  /**
   * 获取批量任务结果
   */
  getTask(taskId: string): BatchTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取所有批量任务
   */
  getTasks(limit = 20): BatchTask[] {
    const tasks = Array.from(this.tasks.values());
    tasks.sort((a, b) => b.startedAt - a.startedAt);
    return tasks.slice(0, limit);
  }

  /**
   * 清理旧任务
   */
  cleanupOldTasks(maxAge = 3600000) {
    const cutoff = Date.now() - maxAge;
    for (const [id, task] of this.tasks) {
      if (task.completedAt && task.completedAt < cutoff) {
        this.tasks.delete(id);
      }
    }
  }

  // ========== 内部方法 ==========

  /**
   * 在单个会话上执行命令
   */
  private async executeOnSession(
    sessionId: string,
    command: string,
    timeout: number,
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const session = this.sshService.getSession(sessionId);

    if (!session) {
      return {
        sessionId,
        connectionId: '',
        sessionName: sessionId,
        success: false,
        output: '',
        duration: Date.now() - startTime,
        error: 'Session not found',
      };
    }

    // 获取会话元信息
    const sessions = this.sshService.getSessions();
    const sessionInfo = sessions.find(s => s.sessionId === sessionId);
    const connectionId = sessionInfo?.connectionId || '';
    const sessionName = sessionInfo?.name || sessionId.substring(0, 8);

    try {
      // 启动输出捕获
      const outputPromise = this.sshService.captureOutput(sessionId, timeout);
      // 写入命令
      this.sshService.writeData(sessionId, command + '\n');
      // 等待输出
      const output = await outputPromise;

      // 清理输出
      const lines = output.split('\n');
      if (lines.length > 0 && lines[0].trim().includes(command.trim().substring(0, 20))) {
        lines.shift();
      }
      const cleanOutput = lines.join('\n').trim();

      return {
        sessionId,
        connectionId,
        sessionName,
        success: true,
        output: cleanOutput || '(no output)',
        duration: Date.now() - startTime,
      };
    } catch (e: any) {
      return {
        sessionId,
        connectionId,
        sessionName,
        success: false,
        output: '',
        duration: Date.now() - startTime,
        error: e.message || 'Execution failed',
      };
    }
  }

  /**
   * 发射事件
   */
  private emitEvent(event: any) {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }
}
