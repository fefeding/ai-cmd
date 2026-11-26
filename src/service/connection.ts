import { request } from '@/service/base';
import type { ConnectionEntity } from '@/typings/connection';

/**
 * SSH 连接管理服务（前端）
 */
export class ConnectionService {
  async getAllConnections() {
    return request('/api/connection/getConnections', {});
  }

  async getConnectionById(id: string) {
    return request('/api/connection/getConnection', { id });
  }

  async addConnection(connection: ConnectionEntity) {
    return request('/api/connection/addConnection', connection);
  }

  async updateConnection(id: string, updates: Partial<ConnectionEntity>) {
    return request('/api/connection/updateConnection', { id, ...updates });
  }

  async deleteConnection(id: string) {
    return request('/api/connection/deleteConnection', { id });
  }

  async testConnection(connection: ConnectionEntity) {
    return request('/api/connection/testConnection', connection);
  }

  /** 导出连接 JSON（默认不含密码/私钥，适合团队共享） */
  async exportConnections(includeSecrets = false) {
    return request('/api/connection/exportConnections', { includeSecrets });
  }

  /** 导入连接 JSON；同名连接按 mode 跳过或覆盖 */
  async importConnections(payload: unknown, mode: 'skip' | 'update' = 'update') {
    return request('/api/connection/importConnections', { payload, mode });
  }
}
