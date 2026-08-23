import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ConnectionEntity } from '../model/connection.entity';
import { getDataPath } from '../utils/data-dir';
import { execSync } from 'child_process';

const ENCRYPTED_PREFIX = 'enc:v1:';
const SECRET_FIELDS: Array<keyof ConnectionEntity> = ['password', 'privateKey', 'passphrase'];

/**
 * SSH 连接管理服务
 * 负责管理 SSH 连接配置的 CRUD，数据存储在本地 JSON 文件中
 */
export class ConnectionService {

  /**
   * 连接配置文件路径
   * 优先使用环境变量 AICMD_DATA_DIR，否则使用用户主目录下的 .aicmd 目录
   */
  private readonly configPath: string;
  private cachedKey: Buffer | null = null;

  constructor() {
    this.configPath = getDataPath('connections.json');
    console.log(`[ConnectionService] configPath: ${this.configPath}`);
  }

  /**
   * 初始化服务，创建配置目录
   */
  async init() {
    const configDir = path.dirname(this.configPath);
    console.log(`[ConnectionService] init: configDir=${configDir}`);
    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log(`[ConnectionService] Created config directory: ${configDir}`);
      }
      // 检查目录是否可写
      fs.accessSync(configDir, fs.constants.W_OK);
      console.log(`[ConnectionService] Config directory is writable`);
    } catch (e: any) {
      console.error(`[ConnectionService] init failed: ${e.message}`);
      console.error(`[ConnectionService] configDir exists: ${fs.existsSync(configDir)}`);
      try {
        const stats = fs.statSync(configDir);
        console.error(`[ConnectionService] configDir mode: ${stats.mode.toString(8)}, uid: ${stats.uid}, gid: ${stats.gid}`);
        console.error(`[ConnectionService] current uid: ${process.getuid?.()}, gid: ${process.getgid?.()}`);
      } catch (_) {}
    }
  }

  /**
   * 获取所有 SSH 连接配置
   */
  async getAllConnections(): Promise<ConnectionEntity[]> {
    try {
      console.log(`[ConnectionService] getAllConnections: reading ${this.configPath}`);
      if (!fs.existsSync(this.configPath)) {
        console.log(`[ConnectionService] Config file does not exist, returning empty`);
        return [];
      }
      const data = fs.readFileSync(this.configPath, 'utf8');
      const connections = JSON.parse(data) as ConnectionEntity[];
      const decryptedConnections = connections.map(conn => this.decryptConnection(conn));
      console.log(`[ConnectionService] Loaded ${decryptedConnections.length} connections`);
      return decryptedConnections;
    } catch (error: any) {
      console.error(`[ConnectionService] Failed to read config: ${error.message}`);
      return [];
    }
  }

  /**
   * 根据 ID 获取 SSH 连接配置
   */
  async getConnectionById(id: string): Promise<ConnectionEntity | null> {
    const connections = await this.getAllConnections();
    return connections.find(conn => conn.id === id) || null;
  }

  /**
   * 添加 SSH 连接配置
   */
  async addConnection(connection: ConnectionEntity): Promise<ConnectionEntity> {
    const connections = await this.getAllConnections();

    // 检查名称是否重复
    if (connections.find(conn => conn.name === connection.name)) {
      throw new Error('连接名称已存在');
    }

    // 生成 ID 并设置时间戳
    connection.id = this.generateId();
    connection.createdAt = new Date();
    connection.updatedAt = new Date();
    connection.enabled = connection.enabled !== undefined ? connection.enabled : true;

    connections.push(connection);
    await this.saveConnections(connections);

    return connection;
  }

  /**
   * 更新 SSH 连接配置
   */
  async updateConnection(id: string, updates: Partial<ConnectionEntity>): Promise<ConnectionEntity> {
    const connections = await this.getAllConnections();
    const index = connections.findIndex(conn => conn.id === id);

    if (index === -1) {
      throw new Error('连接配置不存在');
    }

    // 检查名称重复
    if (updates.name && connections.find((conn, idx) => conn.name === updates.name && idx !== index)) {
      throw new Error('连接名称已存在');
    }

    // 保护敏感字段：如果更新中密码/私钥为空，不覆盖已有值
    // 避免因解密失败（密钥文件权限问题等）导致密码被空值覆盖而永久丢失
    for (const field of SECRET_FIELDS) {
      if (!updates[field]) {
        delete (updates as any)[field];
      }
    }

    connections[index] = { ...connections[index], ...updates, updatedAt: new Date() } as ConnectionEntity;
    await this.saveConnections(connections);
    return connections[index];
  }

  /**
   * 删除 SSH 连接配置
   */
  async deleteConnection(id: string): Promise<void> {
    const connections = await this.getAllConnections();
    const filteredConnections = connections.filter(conn => conn.id !== id);

    if (filteredConnections.length === connections.length) {
      throw new Error('连接配置不存在');
    }

    await this.saveConnections(filteredConnections);
  }

  /**
   * 测试 SSH 连接
   */
  async testConnection(connection: ConnectionEntity): Promise<boolean> {
    try {
      const { Client } = require('ssh2');
      return new Promise<boolean>((resolve) => {
        const conn = new Client();
        const timeout = setTimeout(() => {
          conn.end();
          resolve(false);
        }, 10000);

        conn.on('ready', () => {
          clearTimeout(timeout);
          conn.end();
          resolve(true);
        }).on('error', (err: Error) => {
          clearTimeout(timeout);
          console.error('SSH 连接测试失败:', err.message);
          resolve(false);
        }).connect(this.getSSHConfig(connection));
      });
    } catch (error) {
      console.error('SSH 连接测试异常:', error);
      return false;
    }
  }

  /**
   * 从连接实体提取 ssh2 连接配置
   * @param onLog 可选的日志回调，用于将连接过程信息推送到前端终端
   */
  getSSHConfig(connection: ConnectionEntity, onLog?: (msg: string) => void): any {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };

    const config: any = {
      host: connection.host,
      port: connection.port || 22,
      username: connection.username,
      readyTimeout: 30000,
      // 保活配置：优先使用连接配置中的设置，否则使用默认值
      keepaliveInterval: connection.options?.keepaliveInterval ?? 10000,
      keepaliveCountMax: connection.options?.keepaliveCountMax ?? 3,
    };

    if (connection.authType === 'privateKey' && connection.privateKey) {
      log(`使用私钥认证`);
      config.privateKey = this.convertToPEM(connection.privateKey, undefined, onLog);
      if (connection.passphrase) {
        log(`使用密钥口令保护`);
        config.passphrase = connection.passphrase;
      }
    } else if (connection.password) {
      log(`使用密码认证`);
      config.password = connection.password;
    } else {
      // 没有配置密码和证书，尝试使用本机 SSH 密钥
      log(`未配置密码或私钥，尝试使用本机 SSH 密钥`);
      const localKeyResult = this.getLocalSSHKey(onLog);
      if (localKeyResult) {
        config.privateKey = localKeyResult.key;
      } else {
        log(`未找到可用的认证方式`);
      }
    }

    // SSH Agent forwarding (for jump host scenarios)
    if (connection.forwardAgent) {
      const agentSock = this.getSSHAgentSocket(onLog);
      if (agentSock) {
        config.agent = agentSock;
        log(`Agent forwarding 已启用: ${agentSock}`);
      } else {
        log(`Agent forwarding 已请求但未检测到 SSH agent`);
      }
    }

    // 添加 debug 以查看服务器支持的认证方式；全部推送到前端终端信息流
    config.debug = (msg: string) => {
      if (onLog) {
        onLog(`[debug] ${msg.trim()}`);
      }
    };

    return { ...config, ...connection.options };
  }

  /**
   * 获取本机 SSH 密钥（自动扫描 ~/.ssh 目录下的私钥文件）
   */
  private getLocalSSHKey(onLog?: (msg: string) => void): { key: string; keyPath: string } | null {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };
    const sshDir = path.join(os.homedir(), '.ssh');
    
    try {
      if (!fs.existsSync(sshDir)) {
        log(`SSH 目录不存在: ${sshDir}`);
        return null;
      }

      // 读取 ~/.ssh 目录下所有文件
      const files = fs.readdirSync(sshDir);
      log(`扫描 SSH 目录: ${sshDir} (${files.length} 个文件)`);
      
      // 过滤出可能的私钥文件（排除 .pub、known_hosts、config、authorized_keys 等）
      const privateKeyFiles = files.filter(f => 
        !f.endsWith('.pub') && 
        !['known_hosts', 'known_hosts.old', 'config', 'authorized_keys', 'authorized_keys2'].includes(f) &&
        !f.startsWith('.')
      );

      if (privateKeyFiles.length === 0) {
        log(`~/.ssh 目录下未找到私钥文件`);
        return null;
      }

      log(`候选私钥文件: ${privateKeyFiles.join(', ')}`);

      // 尝试每个私钥文件
      for (const keyFile of privateKeyFiles) {
        const keyPath = path.join(sshDir, keyFile);
        try {
          const stats = fs.statSync(keyPath);
          if (!stats.isFile()) continue;
          
          const key = fs.readFileSync(keyPath, 'utf8');
          // 简单验证是否是有效的私钥文件（包含 BEGIN ... PRIVATE KEY）
          if (key.includes('BEGIN') && key.includes('PRIVATE KEY')) {
            log(`使用本机密钥: ${keyPath}`);
            const convertedKey = this.convertToPEM(key, keyPath, onLog);
            return { key: convertedKey, keyPath };
          }
        } catch (e) {
          log(`读取密钥文件失败 ${keyPath}: ${(e as Error).message}`);
        }
      }

      log(`未找到可用的本机 SSH 私钥`);
      return null;
    } catch (e) {
      log(`扫描 SSH 目录失败: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Detect SSH agent socket for agent forwarding
   * - Linux/macOS: SSH_AUTH_SOCK environment variable
   * - Windows: OpenSSH agent pipe
   */
  private getSSHAgentSocket(onLog?: (msg: string) => void): string | null {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };
    // Standard Unix SSH agent
    if (process.env.SSH_AUTH_SOCK) {
      log(`Agent socket found: ${process.env.SSH_AUTH_SOCK}`);
      return process.env.SSH_AUTH_SOCK;
    }
    // Windows OpenSSH agent - return pipe path directly, let ssh2 handle connection
    if (process.platform === 'win32') {
      const pipe = '\\\\.\\pipe\\openssh-ssh-agent';
      log(`Windows: using OpenSSH agent pipe: ${pipe}`);
      log(`If agent is not running, execute in PowerShell (Admin):`);
      log(`  Start-Service ssh-agent; Set-Service ssh-agent -StartupType Automatic`);
      log(`  ssh-add ~\\.ssh\\id_rsa`);
      return pipe;
    }
    log(`No SSH agent detected. Agent forwarding will not work.`);
    log(`Linux/macOS: eval $(ssh-agent) && ssh-add ~/.ssh/id_rsa`);
    return null;
  }

  /**
   * 处理私钥格式
   * ssh2 库对 OpenSSH 格式支持不完善，需要转换为 PEM 格式
   */
  private convertToPEM(privateKey: string, keyPath?: string, onLog?: (msg: string) => void): string {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };
    // 如果已经是 PEM 格式（PKCS#1 或 PKCS#8），直接返回
    if (privateKey.includes('BEGIN RSA PRIVATE KEY') || privateKey.includes('BEGIN PRIVATE KEY')) {
      log(`私钥已是 PEM 格式，无需转换`);
      return privateKey;
    }
    
    // OpenSSH 格式：尝试多种方式转换
    if (privateKey.includes('BEGIN OPENSSH PRIVATE KEY')) {
      log(`检测到 OpenSSH 格式私钥，需要转换为 PEM 格式`);
      // 方式1: 使用 ssh-keygen 转换（最可靠，不修改原文件）
      if (keyPath) {
        const converted = this.convertWithSSHKeygen(keyPath, onLog);
        if (converted) return converted;
      }
      
      // 方式2: 使用 Node.js crypto（部分版本支持）
      try {
        const keyObject = crypto.createPrivateKey(privateKey);
        const result = keyObject.export({ type: 'pkcs1', format: 'pem' }).toString();
        log(`使用 Node.js crypto 成功转换私钥格式为 PEM`);
        return result;
      } catch (e) {
        log(`crypto.createPrivateKey 转换失败: ${(e as Error).message}`);
      }
      
      // 方式3: 直接返回，让 ssh2 尝试解析
      log(`无法转换 OpenSSH 格式私钥，尝试直接传递给 ssh2`);
      return privateKey;
    }
    
    // 其他未知格式：尝试用 Node.js crypto 解析并导出为 PEM
    try {
      const keyObject = crypto.createPrivateKey(privateKey);
      const result = keyObject.export({ type: 'pkcs8', format: 'pem' }).toString();
      log(`使用 Node.js crypto 成功转换未知格式私钥为 PEM`);
      return result;
    } catch (e) {
      log(`转换私钥格式失败，使用原始私钥: ${(e as Error).message}`);
      return privateKey;
    }
  }

  /**
   * 使用 ssh-keygen 将 OpenSSH 格式私钥转换为 PEM 格式
   * 通过复制到临时文件来避免修改原始密钥
   */
  private convertWithSSHKeygen(keyPath: string, onLog?: (msg: string) => void): string | null {
    const log = (msg: string) => { console.log(`[SSH] ${msg}`); onLog?.(msg); };
    try {
      log(`使用 ssh-keygen 转换私钥: ${keyPath}`);
      const tmpDir = path.join(os.tmpdir(), 'aicmd-ssh-key-convert');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      const tmpKeyPath = path.join(tmpDir, 'temp_key');
      fs.copyFileSync(keyPath, tmpKeyPath);
      
      // 设置文件权限为仅所有者可读写（Unix 系统需要）
      if (process.platform !== 'win32') {
        fs.chmodSync(tmpKeyPath, 0o600);
      }
      
      // 使用 ssh-keygen 转换为 PEM 格式
      execSync(`ssh-keygen -p -m PEM -f "${tmpKeyPath}" -N ""`, {
        timeout: 5000,
        stdio: 'pipe'
      });
      
      const convertedKey = fs.readFileSync(tmpKeyPath, 'utf8');
      
      // 清理临时文件
      try {
        fs.unlinkSync(tmpKeyPath);
      } catch (e) {
        // 忽略清理失败
      }
      
      if (convertedKey.includes('BEGIN RSA PRIVATE KEY') || convertedKey.includes('BEGIN PRIVATE KEY')) {
        log(`使用 ssh-keygen 成功转换私钥格式为 PEM`);
        return convertedKey;
      }
      
      log(`ssh-keygen 转换后未得到 PEM 格式密钥`);
      return null;
    } catch (e) {
      log(`ssh-keygen 转换失败: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * 保存连接配置到文件
   */
  private async saveConnections(connections: ConnectionEntity[]): Promise<void> {
    try {
      const dir = path.dirname(this.configPath);
      console.log(`[ConnectionService] saveConnections: ${connections.length} items -> ${this.configPath}`);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[ConnectionService] Created directory: ${dir}`);
      }
      // 检查可写性
      try {
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (e: any) {
        console.error(`[ConnectionService] Directory NOT writable: ${dir}, error: ${e.message}`);
      }
      const encryptedConnections = connections.map(conn => this.encryptConnection(conn));
      fs.writeFileSync(this.configPath, JSON.stringify(encryptedConnections, null, 2), { encoding: 'utf8', mode: 0o600 });
      try { fs.chmodSync(this.configPath, 0o600); } catch (_) { /* ignore */ }
      console.log(`[ConnectionService] saveConnections: done`);
    } catch (error: any) {
      console.error(`[ConnectionService] saveConnections FAILED: ${error.message}`);
      console.error(`[ConnectionService] configPath: ${this.configPath}`);
      console.error(`[ConnectionService] stack: ${error.stack}`);
      throw error;
    }
  }

  private encryptConnection(connection: ConnectionEntity): ConnectionEntity {
    const encrypted: any = { ...connection };
    for (const field of SECRET_FIELDS) {
      const value = encrypted[field];
      if (typeof value === 'string' && value && !value.startsWith(ENCRYPTED_PREFIX)) {
        encrypted[field] = this.encryptSecret(value);
      }
    }
    return encrypted as ConnectionEntity;
  }

  private decryptConnection(connection: ConnectionEntity): ConnectionEntity {
    const decrypted: any = { ...connection };
    for (const field of SECRET_FIELDS) {
      const value = decrypted[field];
      if (typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX)) {
        decrypted[field] = this.decryptSecret(value);
      }
    }
    return decrypted as ConnectionEntity;
  }

  private getEncryptionKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const keyPath = getDataPath('connections.key');
    try {
      if (fs.existsSync(keyPath)) {
        const content = fs.readFileSync(keyPath, 'utf8').trim();
        this.cachedKey = crypto.createHash('sha256').update(content).digest();
        return this.cachedKey;
      }
      // 密钥文件不存在，创建新密钥
      const secret = crypto.randomBytes(32).toString('base64url');
      fs.writeFileSync(keyPath, secret, { encoding: 'utf8', mode: 0o600 });
      try { fs.chmodSync(keyPath, 0o600); } catch (_) { /* ignore */ }
      this.cachedKey = crypto.createHash('sha256').update(secret).digest();
      console.log(`[ConnectionService] Created new encryption key at ${keyPath}`);
      return this.cachedKey;
    } catch (error: any) {
      // 密钥文件存在但无法读取（如权限问题），尝试修复
      console.warn(`[ConnectionService] Failed to load encryption key: ${error.message}`);
      try {
        // 尝试修复权限
        fs.chmodSync(keyPath, 0o600);
        const content = fs.readFileSync(keyPath, 'utf8').trim();
        this.cachedKey = crypto.createHash('sha256').update(content).digest();
        console.log(`[ConnectionService] Fixed key file permissions and loaded key`);
        return this.cachedKey;
      } catch (_) {
        // 权限修复失败，尝试删除并重建密钥文件
        try {
          fs.unlinkSync(keyPath);
          const secret = crypto.randomBytes(32).toString('base64url');
          fs.writeFileSync(keyPath, secret, { encoding: 'utf8', mode: 0o600 });
          this.cachedKey = crypto.createHash('sha256').update(secret).digest();
          console.warn(`[ConnectionService] Recreated encryption key file (old encrypted data will be lost)`);
          return this.cachedKey;
        } catch (_) {
          // 完全无法操作密钥文件，使用回退密钥
          this.cachedKey = crypto.createHash('sha256').update(`${os.hostname()}:${os.homedir()}:aicmd`).digest();
          console.warn(`[ConnectionService] Using fallback encryption key`);
          return this.cachedKey;
        }
      }
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
      console.warn(`[ConnectionService] Failed to decrypt secret: ${error.message}`);
      return '';
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
