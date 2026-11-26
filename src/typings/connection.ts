/**
 * 连接代理配置
 * - direct：直连；system：系统代理（环境变量）；custom：自定义代理
 */
export interface ConnectionProxy {
  mode: 'direct' | 'system' | 'custom';
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

/**
 * SSH 端口转发规则
 * - local：本地端口 → 远端目标（ssh -L，常用于访问远程数据库 / 内网服务）
 * - remote：远端端口 → 本地目标（ssh -R）
 */
export interface PortForwardRule {
  id: string;
  name?: string;
  direction: 'local' | 'remote';
  /** 监听地址（local: 本地监听；remote: 远端监听），默认 127.0.0.1 */
  listenHost: string;
  listenPort: number;
  /** 目标地址（local: 相对 SSH 服务器；remote: 相对本机），默认 127.0.0.1 */
  targetHost: string;
  targetPort: number;
  /** 会话建立后是否自动启动，默认 true */
  autoStart?: boolean;
  enabled?: boolean;
}

/**
 * 端口转发运行时状态
 */
export interface PortForwardStatus {
  ruleId: string;
  status: 'stopped' | 'starting' | 'active' | 'error';
  error?: string;
  startedAt?: Date;
  /** 当前活跃连接数 */
  connections?: number;
  /** 是否被多个会话/页面共享 */
  shared?: boolean;
}

/**
 * 连接配置接口
 */
export interface ConnectionEntity {
  id?: string;
  name: string;
  /** 侧栏分组名（空表示未分组） */
  group?: string;
  /** 侧栏标签，用于搜索与分类 */
  tags?: string[];
  type?: 'ssh' | 'local' | 'rdp';
  host?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'privateKey' | 'auto';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** 本地 shell 路径（仅 type='local' 时使用） */
  shell?: string;
  /** 连接后自动执行的脚本（如跳板机跳转命令） */
  startupScript?: string;
  /** 是否启用 SSH Agent 转发（用于跳板机密钥认证） */
  forwardAgent?: boolean;
  /** SSH 端口转发规则（本地隧道 / 远程转发） */
  portForwards?: PortForwardRule[];
  terminal?: {
    cols: number;
    rows: number;
    fontSize: number;
    fontFamily: string;
    theme: string;
    cursorStyle: 'block' | 'underline' | 'bar';
  };
  options?: Record<string, any>;
  /** 网络代理配置（SSH / RDP 均支持） */
  proxy?: ConnectionProxy;
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
  type: 'terminal' | 'resize' | 'create' | 'reconnect' | 'close' | 'status' | 'error' | 'conn-log' | 'zmodem' | 'ai-agent-event' | 'ai-agent-run' | 'ai-agent-stop' | 'monitor-event' | 'file-upload' | 'file-upload-result' | 'file-upload-start' | 'file-upload-chunk' | 'file-upload-end' | 'file-upload-progress' | 'rdp-create' | 'rdp-input' | 'rdp-size' | 'rdp-close' | 'rdp-frame' | 'rdp-ready';
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
