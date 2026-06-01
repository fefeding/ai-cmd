/**
 * 连接配置实体
 * 实际数据保存在本地 JSON 文件中（~/.aicmd/connections.json）
 */
export class ConnectionEntity {
  /** 连接 ID */
  id!: string;

  /** 连接名称 */
  name!: string;

  /** 连接类型：ssh 或 local（本地 shell） */
  type: 'ssh' | 'local' = 'ssh';

  /** 主机地址 */
  host!: string;

  /** SSH 端口，默认 22 */
  port: number = 22;

  /** 用户名 */
  username!: string;

  /** 认证方式：password（密码）、privateKey（私钥）、auto（自动使用本机密钥） */
  authType: 'password' | 'privateKey' | 'auto' = 'auto';

  /** 密码（加密存储） */
  password?: string;

  /** 私钥内容 */
  privateKey?: string;

  /** 私钥密码 */
  passphrase?: string;

  /** 本地 shell 路径（仅 type='local' 时使用） */
  shell?: string;

  /** 连接后自动执行的脚本（如跳板机跳转命令） */
  startupScript?: string;

  /** 是否启用 SSH Agent 转发（用于跳板机密钥认证） */
  forwardAgent?: boolean;

  /** 终端配置 */
  terminal: {
    cols: number;
    rows: number;
    fontSize: number;
    fontFamily: string;
    theme: string;
    cursorStyle: 'block' | 'underline' | 'bar';
  } = {
    cols: 80,
    rows: 24,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: 'dark',
    cursorStyle: 'block',
  };

  /** 扩展选项（keepalive 间隔等） */
  options: Record<string, any> = {};

  /** 是否启用 */
  enabled: boolean = true;

  /** 创建时间 */
  createdAt: Date = new Date();

  /** 更新时间 */
  updatedAt: Date = new Date();
}
