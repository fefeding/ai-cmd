/**
 * 连接配置接口
 */
export interface ConnectionEntity {
  id?: string;
  name: string;
  type?: 'ssh' | 'local';
  host?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'privateKey' | 'auto';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** 本地 shell 路径（仅 type='local' 时使用） */
  shell?: string;
  terminal?: {
    cols: number;
    rows: number;
    fontSize: number;
    fontFamily: string;
    theme: string;
    cursorStyle: 'block' | 'underline' | 'bar';
  };
  options?: Record<string, any>;
  enabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 终端 Tab 信息
 */
export interface TerminalTab {
  id: string;
  connectionId: string;
  connectionName: string;
  sessionId?: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';
  cols: number;
  rows: number;
}

/**
 * WebSocket 消息协议
 */
export interface WSMessage {
  type: 'terminal' | 'resize' | 'create' | 'reconnect' | 'close' | 'status' | 'error' | 'zmodem' | 'ai-agent-event' | 'ai-agent-run' | 'ai-agent-stop' | 'monitor-event';
  sessionId?: string;
  data?: any;
  binary?: boolean;
  event?: any; // AI Agent 事件
}

/**
 * API 响应格式
 */
export interface ApiResponse<T = any> {
  ret: number;
  msg: string;
  data?: T;
}
