import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import { Client, type ClientChannel } from 'ssh2';
import { ConnectionEntity } from '../model/connection.entity';
import { ConnectionService } from './connection.service';
import { getDataPath } from '../utils/data-dir';
import { shellQuote } from '../utils/shell';

const ENCRYPTED_PREFIX = 'enc:v1:';

/** 受管密钥元数据（私钥内容加密存储，list 不下发） */
export interface ManagedKey {
  id: string;
  name: string;
  /** ed25519 / rsa */
  type: string;
  /** OpenSSH 格式公钥 */
  publicKey: string;
  /** 指纹（SHA256:base64） */
  fingerprint?: string;
  /** 注释 */
  comment?: string;
  /** generated / imported */
  source: 'generated' | 'imported';
  /** 是否有口令保护（不存储口令本身） */
  hasPassphrase?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredKey extends ManagedKey {
  /** 加密后的 PEM 私钥 */
  privateKey: string;
}

function log(msg: string) {
  console.log(`[SSHKey] ${msg}`);
}

function encString(buf: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

function encMpint(buf: Buffer): Buffer {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i++;
  let value = buf.subarray(i);
  if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0]), value]);
  return encString(value);
}

function b64uToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** 从 Node Crypto 的公钥对象生成 OpenSSH 公钥字符串 */
function opensshPublicKey(publicKey: crypto.KeyObject, type: string, comment: string): string {
  if (type === 'ed25519') {
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const raw = der.subarray(der.length - 32);
    const blob = Buffer.concat([encString(Buffer.from('ssh-ed25519')), encString(raw)]);
    return `ssh-ed25519 ${blob.toString('base64')}${comment ? ' ' + comment : ''}`;
  }
  const jwk = publicKey.export({ format: 'jwk' }) as any;
  const e = b64uToBuffer(jwk.e);
  const n = b64uToBuffer(jwk.n);
  const blob = Buffer.concat([encString(Buffer.from('ssh-rsa')), encMpint(e), encMpint(n)]);
  return `ssh-rsa ${blob.toString('base64')}${comment ? ' ' + comment : ''}`;
}

function fingerprintOf(publicKey: string): string {
  try {
    const parts = publicKey.trim().split(/\s+/);
    const blob = Buffer.from(parts[1] || '', 'base64');
    return `SHA256:${crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
  } catch (_) {
    return '';
  }
}

/**
 * SSH 密钥管理服务
 *
 * - 生成：优先 ssh-keygen（生成原生 OpenSSH 格式），不可用时用 Node crypto 兜底
 * - 导入：校验私钥并推导公钥（ssh-keygen -y / Node crypto 兜底）
 * - 存储：私钥经 AES-256-GCM 加密后落盘到 ~/.aicmd/ssh-keys.json，与连接配置共用主密钥
 * - 分发：ssh-copy-id 语义，通过已有 SSH 连接把公钥追加到远端 authorized_keys
 */
export class SSHKeyService {
  private readonly configPath: string;
  private connectionService: ConnectionService;

  constructor(connectionService: ConnectionService) {
    this.connectionService = connectionService;
    this.configPath = getDataPath('ssh-keys.json');
  }

  private readAll(): StoredKey[] {
    try {
      if (!fs.existsSync(this.configPath)) return [];
      const data = fs.readFileSync(this.configPath, 'utf8');
      const list = JSON.parse(data);
      return Array.isArray(list) ? list : [];
    } catch (e: any) {
      log(`读取密钥库失败: ${e.message}`);
      return [];
    }
  }

  private writeAll(keys: StoredKey[]): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(this.configPath, 0o600); } catch (_) {}
  }

  private encrypt(value: string): string {
    if (value.startsWith(ENCRYPTED_PREFIX)) return value;
    return this.connectionService.encryptText(value);
  }

  private decrypt(value: string): string {
    if (!value?.startsWith(ENCRYPTED_PREFIX)) return value || '';
    return this.connectionService.decryptText(value);
  }

  private toPublic(key: StoredKey): ManagedKey {
    const { privateKey: _ignored, ...rest } = key;
    return rest;
  }

  /** 列出全部受管密钥（不含私钥） */
  list(): ManagedKey[] {
    return this.readAll().map(k => this.toPublic(k));
  }

  /** 获取单条密钥元数据（不含私钥） */
  get(id: string): ManagedKey | undefined {
    const key = this.readAll().find(k => k.id === id);
    return key ? this.toPublic(key) : undefined;
  }

  /** 获取私钥明文（用于填入连接编辑器） */
  getPrivateKey(id: string): { privateKey: string; comment?: string } | undefined {
    const key = this.readAll().find(k => k.id === id);
    if (!key) return undefined;
    return { privateKey: this.decrypt(key.privateKey), comment: key.comment };
  }

  /** 删除密钥 */
  delete(id: string): boolean {
    const keys = this.readAll();
    const next = keys.filter(k => k.id !== id);
    if (next.length === keys.length) return false;
    this.writeAll(next);
    log(`deleted key ${id}`);
    return true;
  }

  /**
   * 生成密钥对
   */
  async generate(options: {
    name: string;
    type?: 'ed25519' | 'rsa';
    bits?: number;
    comment?: string;
    passphrase?: string;
  }): Promise<ManagedKey> {
    const name = String(options.name || '').trim();
    if (!name) throw new Error('密钥名称不能为空');
    const existing = this.readAll();
    if (existing.some(k => k.name === name)) throw new Error('密钥名称已存在');

    const type = options.type === 'rsa' ? 'rsa' : 'ed25519';
    const bits = type === 'rsa' ? Number(options.bits || 4096) : undefined;
    const comment = String(options.comment || '').trim();
    const passphrase = String(options.passphrase || '');

    let privateKey: string;
    let publicKey: string;
    let generatedBy = 'ssh-keygen';

    const result = this.generateWithSSHKeygen(type, bits, comment, passphrase);
    if (result) {
      privateKey = result.privateKey;
      publicKey = result.publicKey;
    } else {
      generatedBy = 'node-crypto';
      log('ssh-keygen 不可用，使用 Node crypto 生成密钥');
      const keyPair = (crypto.generateKeyPairSync as any)(type, {
        ...(type === 'rsa' ? { modulusLength: bits || 4096 } : {}),
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          ...(passphrase ? { cipher: 'aes-256-cbc', passphrase } : {}),
        },
      });
      privateKey = keyPair.privateKey as string;
      const publicKeyObj = crypto.createPublicKey(keyPair.publicKey);
      publicKey = opensshPublicKey(publicKeyObj, type, comment);
    }

    const key: StoredKey = {
      id: `key_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      name,
      type,
      publicKey: publicKey.trim(),
      fingerprint: fingerprintOf(publicKey),
      comment,
      source: 'generated',
      hasPassphrase: !!passphrase,
      privateKey: this.encrypt(privateKey),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    existing.push(key);
    this.writeAll(existing);
    log(`generated ${type} key "${name}" via ${generatedBy}`);
    return this.toPublic(key);
  }

  private generateWithSSHKeygen(type: string, bits: number | undefined, comment: string, passphrase: string): { privateKey: string; publicKey: string } | null {
    let tmpDir: string | undefined;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicmd-keygen-'));
      const keyPath = path.join(tmpDir, 'id_key');
      const args = ['-t', type, '-f', keyPath, '-N', passphrase, '-q'];
      if (type === 'rsa') args.push('-b', String(bits || 4096));
      if (comment) args.push('-C', comment);
      const res = spawnSync('ssh-keygen', args, { encoding: 'utf8', timeout: 20000 });
      if (res.error || res.status !== 0) {
        log(`ssh-keygen 失败: ${res.error?.message || res.stderr?.trim() || res.status}`);
        return null;
      }
      const privateKey = fs.readFileSync(keyPath, 'utf8');
      const publicKey = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim();
      return { privateKey, publicKey };
    } catch (e: any) {
      log(`ssh-keygen 异常: ${e.message}`);
      return null;
    } finally {
      if (tmpDir) this.cleanupTmp(tmpDir);
    }
  }

  /**
   * 导入已有私钥
   */
  async import(options: {
    name: string;
    privateKey: string;
    passphrase?: string;
    publicKey?: string;
    comment?: string;
  }): Promise<ManagedKey> {
    const name = String(options.name || '').trim();
    const privateKey = String(options.privateKey || '').trim();
    if (!name) throw new Error('密钥名称不能为空');
    if (!privateKey) throw new Error('私钥内容不能为空');
    if (!/PRIVATE KEY/.test(privateKey)) throw new Error('无效的私钥内容');

    const existing = this.readAll();
    if (existing.some(k => k.name === name)) throw new Error('密钥名称已存在');

    const passphrase = String(options.passphrase || '');
    const comment = String(options.comment || '').trim();
    let publicKey = String(options.publicKey || '').trim();
    let type = 'ed25519';

    if (!publicKey) {
      publicKey = this.derivePublicKey(privateKey, passphrase, comment) || '';
    }
    if (!publicKey) throw new Error('无法从私钥推导公钥，请确认私钥有效并填写正确的口令');
    type = publicKey.startsWith('ssh-rsa') ? 'rsa' : 'ed25519';

    const key: StoredKey = {
      id: `key_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      name,
      type,
      publicKey,
      fingerprint: fingerprintOf(publicKey),
      comment,
      source: 'imported',
      hasPassphrase: !!passphrase,
      privateKey: this.encrypt(privateKey),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    existing.push(key);
    this.writeAll(existing);
    log(`imported ${type} key "${name}"`);
    return this.toPublic(key);
  }

  private derivePublicKey(privateKey: string, passphrase: string, comment: string): string | null {
    // 方式 1：ssh-keygen -y
    let tmpDir: string | undefined;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicmd-keyderive-'));
      const keyPath = path.join(tmpDir, 'id_key');
      // OpenSSH 格式私钥必须以换行结尾，否则 ssh-keygen 报 "invalid format"
      const content = privateKey.endsWith('\n') ? privateKey : privateKey + '\n';
      fs.writeFileSync(keyPath, content, { mode: 0o600 });
      try { fs.chmodSync(keyPath, 0o600); } catch (_) {}
      const res = spawnSync('ssh-keygen', ['-y', '-f', keyPath, '-P', passphrase], { encoding: 'utf8', timeout: 15000 });
      if (res.status === 0 && res.stdout?.trim()) {
        const pub = res.stdout.trim();
        return comment ? `${pub} ${comment}` : pub;
      }
    } catch (e: any) {
      log(`ssh-keygen -y 失败: ${e.message}`);
    } finally {
      if (tmpDir) this.cleanupTmp(tmpDir);
    }
    // 方式 2：Node crypto
    try {
      const keyObj = crypto.createPrivateKey(passphrase ? { key: privateKey, passphrase } : privateKey);
      const pubObj = crypto.createPublicKey(keyObj);
      const type = (pubObj.asymmetricKeyType === 'rsa') ? 'rsa' : 'ed25519';
      return opensshPublicKey(pubObj, type, comment);
    } catch (e: any) {
      log(`Node crypto 推导公钥失败: ${e.message}`);
      return null;
    }
  }

  private cleanupTmp(dir: string): void {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }

  /**
   * 分发公钥到远端主机（ssh-copy-id 语义）
   * 支持传入保存的连接 id，或临时连接参数。
   */
  async distribute(options: {
    keyId: string;
    connectionId?: string;
    connection?: Partial<ConnectionEntity>;
    /** 自定义 authorized_keys 路径，默认 ~/.ssh/authorized_keys */
    remotePath?: string;
    timeout?: number;
  }): Promise<{ success: boolean; message: string }> {
    const key = this.get(options.keyId);
    if (!key) throw new Error('密钥不存在');
    if (!key.publicKey) throw new Error('密钥缺少公钥');

    let connection: ConnectionEntity;
    if (options.connectionId) {
      const saved = await this.connectionService.getConnectionById(options.connectionId);
      if (!saved) throw new Error('连接配置不存在');
      connection = saved;
    } else if (options.connection) {
      connection = options.connection as ConnectionEntity;
    } else {
      throw new Error('缺少目标连接');
    }
    if (!connection.host || !connection.username) throw new Error('目标连接缺少主机或用户名');

    const sshConfig = await this.connectionService.getSSHConfig(connection);
    const isWindows = connection.platform === 'windows';
    const remotePath = String(options.remotePath || '').trim();
    const command = isWindows
      ? this.buildWindowsAppendCommand(key.publicKey, remotePath)
      : this.buildUnixAppendCommand(key.publicKey, remotePath);

    const timeout = Number(options.timeout || 20000);
    return new Promise((resolve) => {
      const client = new Client();
      let settled = false;
      const finish = (success: boolean, message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { client.end(); } catch (_) {}
        resolve({ success, message });
      };
      const timer = setTimeout(() => finish(false, '分发公钥超时'), timeout);

      client.on('ready', () => {
        client.exec(command, (err: Error | undefined, stream: ClientChannel) => {
          if (err) return finish(false, `执行远端命令失败: ${err.message}`);
          let stdout = '';
          let stderr = '';
          let exitCode: number | null = null;
          stream.on('data', (data: Buffer) => { stdout += data.toString('utf8'); });
          stream.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8'); });
          stream.on('exit', (code: number | null) => { exitCode = code; });
          stream.on('close', () => {
            const detail = (stderr || stdout).trim();
            if (exitCode !== 0) {
              return finish(false, `分发公钥失败（远端退出码 ${exitCode}）：${detail.slice(0, 300) || '无错误输出'}`);
            }
            finish(true, detail ? `公钥已分发: ${detail.slice(0, 300)}` : '公钥已分发');
          });
          stream.on('error', (e: Error) => finish(false, e.message));
        });
      });
      client.on('error', (err: Error) => finish(false, err.message));
      try {
        client.connect(sshConfig);
      } catch (e: any) {
        finish(false, e.message);
      }
    });
  }

  /** shell 双引号内的转义（用于拼接含 $HOME 的路径） */
  private shellDoubleQuoted(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  }

  private buildUnixAppendCommand(publicKey: string, remotePath?: string): string {
    const raw = String(remotePath || '').trim();
    // 单引号会抑制 ~ 展开，显式用 $HOME 拼接
    const target = !raw
      ? '"$HOME/.ssh/authorized_keys"'
      : raw === '~'
        ? '"$HOME"'
        : raw.startsWith('~/')
          ? `"$HOME/${this.shellDoubleQuoted(raw.slice(2))}"`
          : shellQuote(raw);
    const key = shellQuote(publicKey.trim());
    return [
      `d=$(dirname ${target})`,
      `mkdir -p "$d" && chmod 700 "$d"`,
      `touch ${target} && chmod 600 ${target}`,
      `(grep -qxF ${key} ${target} 2>/dev/null || printf '%s\\n' ${key} >> ${target})`,
      `chmod 600 ${target}`,
      `echo OK`,
    ].join(' && ');
  }

  private buildWindowsAppendCommand(publicKey: string, remotePath?: string): string {
    // PowerShell 字符串用单引号，内部单引号需双写
    const esc = (v: string) => v.replace(/'/g, "''");
    const raw = String(remotePath || '').trim();
    // PowerShell 会展开 $HOME，不要用 cmd 风格的引号包裹整段命令
    const pathExpr = !raw
      ? 'Join-Path $HOME \'.ssh\\authorized_keys\''
      : raw.startsWith('~/')
        ? `Join-Path $HOME '${esc(raw.slice(2).replace(/\//g, '\\'))}'`
        : `'${esc(raw)}'`;
    const key = `'${esc(publicKey.trim())}'`;
    const ps = [
      `$f = ${pathExpr}`,
      `$dir = Split-Path -Parent $f`,
      `[void](New-Item -ItemType Directory -Force -Path $dir)`,
      `if (Test-Path $f) {`,
      `  $lines = Get-Content $f -ErrorAction SilentlyContinue`,
      `  if ($lines -notcontains ${key}) { Add-Content -Path $f -Value ${key} -Encoding utf8 }`,
      `} else { Set-Content -Path $f -Value ${key} -Encoding utf8 }`,
      `Write-Output OK`,
    ].join('; ');
    // cmd.exe 不认单引号分组；脚本内部只有单引号，用双引号包裹整段传给 powershell.exe
    return `powershell.exe -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`;
  }
}
