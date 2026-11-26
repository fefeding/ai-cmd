import { request } from '@/service/base';

function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'ret' in res) {
    if (res.ret !== 0) throw new Error(res.msg || '请求失败');
    return res.data as T;
  }
  return res as T;
}

/**
 * 受管 SSH 密钥（不含私钥内容）
 */
export interface ManagedKey {
  id: string;
  name: string;
  type: string;
  publicKey: string;
  fingerprint?: string;
  comment?: string;
  source: 'generated' | 'imported';
  hasPassphrase?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * SSH 密钥管理服务（前端）
 */
export class SSHKeyService {
  async list(): Promise<ManagedKey[]> {
    return request('/api/ssh-key/list', {}).then(unwrap<ManagedKey[]>);
  }

  async generate(options: {
    name: string;
    type?: 'ed25519' | 'rsa';
    bits?: number;
    comment?: string;
    passphrase?: string;
  }): Promise<ManagedKey> {
    return request('/api/ssh-key/generate', options).then(unwrap<ManagedKey>);
  }

  async import(options: {
    name: string;
    privateKey: string;
    passphrase?: string;
    publicKey?: string;
    comment?: string;
  }): Promise<ManagedKey> {
    return request('/api/ssh-key/import', options).then(unwrap<ManagedKey>);
  }

  async getPrivateKey(id: string): Promise<{ privateKey: string; comment?: string }> {
    return request('/api/ssh-key/getPrivateKey', { id }).then(unwrap<{ privateKey: string; comment?: string }>);
  }

  async delete(id: string): Promise<boolean> {
    return request('/api/ssh-key/delete', { id }).then(unwrap<boolean>);
  }

  async distribute(options: {
    keyId: string;
    connectionId?: string;
    connection?: any;
    remotePath?: string;
    timeout?: number;
  }): Promise<{ success: boolean; message: string }> {
    return request('/api/ssh-key/distribute', options).then(unwrap<{ success: boolean; message: string }>);
  }
}

export const sshKeyService = new SSHKeyService();
