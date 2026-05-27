import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ConnectionEntity } from '../model/connection.entity';

/**
 * SSH 连接管理服务
 * 负责管理 SSH 连接配置的 CRUD，数据存储在本地 JSON 文件中
 */
export class ConnectionService {

  /**
   * 连接配置文件路径
   * 优先使用环境变量 fterm_DATA_DIR，否则使用用户主目录下的 .fterm 目录
   */
  private readonly configPath: string;

  constructor() {
    const dataDir = process.env.fterm_DATA_DIR || path.join(os.homedir(), '.fterm');
    this.configPath = path.join(dataDir, 'connections.json');
  }

  /**
   * 初始化服务，创建配置目录
   */
  async init() {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * 获取所有 SSH 连接配置
   */
  async getAllConnections(): Promise<ConnectionEntity[]> {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }
      const data = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(data) as ConnectionEntity[];
    } catch (error) {
      console.error('读取连接配置失败:', error);
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
   */
  getSSHConfig(connection: ConnectionEntity): any {
    const config: any = {
      host: connection.host,
      port: connection.port || 22,
      username: connection.username,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    };

    if (connection.authType === 'privateKey' && connection.privateKey) {
      config.privateKey = this.convertToPEM(connection.privateKey);
      if (connection.passphrase) {
        config.passphrase = connection.passphrase;
      }
    } else if (connection.password) {
      config.password = connection.password;
    } else {
      // 没有配置密码和证书，尝试使用本机 SSH 密钥
      const localKey = this.getLocalSSHKey();
      if (localKey) {
        config.privateKey = localKey;
      }
    }

    return { ...config, ...connection.options };
  }

  /**
   * 获取本机 SSH 密钥（自动扫描 ~/.ssh 目录下的私钥文件）
   */
  private getLocalSSHKey(): string | null {
    const sshDir = path.join(os.homedir(), '.ssh');
    
    try {
      if (!fs.existsSync(sshDir)) {
        console.warn(`[SSH] SSH 目录不存在: ${sshDir}`);
        return null;
      }

      // 读取 ~/.ssh 目录下所有文件
      const files = fs.readdirSync(sshDir);
      
      // 过滤出可能的私钥文件（排除 .pub、known_hosts、config、authorized_keys 等）
      const privateKeyFiles = files.filter(f => 
        !f.endsWith('.pub') && 
        !['known_hosts', 'known_hosts.old', 'config', 'authorized_keys', 'authorized_keys2'].includes(f) &&
        !f.startsWith('.')
      );

      if (privateKeyFiles.length === 0) {
        console.warn('[SSH] ~/.ssh 目录下未找到私钥文件');
        return null;
      }

      // 尝试每个私钥文件
      for (const keyFile of privateKeyFiles) {
        const keyPath = path.join(sshDir, keyFile);
        try {
          const stats = fs.statSync(keyPath);
          if (!stats.isFile()) continue;
          
          const key = fs.readFileSync(keyPath, 'utf8');
          // 简单验证是否是有效的私钥文件（包含 BEGIN ... PRIVATE KEY）
          if (key.includes('BEGIN') && key.includes('PRIVATE KEY')) {
            console.log(`[SSH] 使用本机密钥: ${keyPath}`);
            return this.convertToPEM(key);
          }
        } catch (e) {
          console.warn(`[SSH] 读取密钥文件失败 ${keyPath}:`, (e as Error).message);
        }
      }

      console.warn('[SSH] 未找到可用的本机 SSH 私钥');
      return null;
    } catch (e) {
      console.error(`[SSH] 扫描 SSH 目录失败:`, (e as Error).message);
      return null;
    }
  }

  /**
   * 将 OpenSSH 格式的私钥转换为 PEM 格式
   * ssh2 库不支持 OpenSSH 格式，需要转换
   */
  private convertToPEM(privateKey: string): string {
    // 如果已经是 PEM 格式，直接返回
    if (privateKey.includes('BEGIN RSA PRIVATE KEY') || privateKey.includes('BEGIN PRIVATE KEY')) {
      return privateKey;
    }
    // 尝试转换 OpenSSH 格式为 PEM 格式
    try {
      const keyObject = crypto.createPrivateKey({
        key: privateKey,
        format: 'openssh' as crypto.KeyFormat,
      });
      return keyObject.export({ type: 'pkcs8', format: 'pem' }).toString();
    } catch (e) {
      console.warn('转换私钥格式失败，使用原始私钥:', (e as Error).message);
      return privateKey;
    }
  }

  /**
   * 保存连接配置到文件
   */
  private async saveConnections(connections: ConnectionEntity[]): Promise<void> {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(connections, null, 2), 'utf8');
    } catch (error) {
      console.error('保存连接配置失败:', error);
      throw error;
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
