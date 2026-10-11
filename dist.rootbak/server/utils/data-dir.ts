import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * 获取数据目录路径（统一入口）
 * 所有需要写入的文件（PID、日志、配置、会话等）都必须通过此函数获取目录
 *
 * 优先级：环境变量 AICMD_DATA_DIR > ~/.aicmd
 */
export function getDataDir(): string {
  const dir = process.env.AICMD_DATA_DIR || path.join(os.homedir(), '.aicmd');
  console.log(`[data-dir] getDataDir: ${dir}, home: ${os.homedir()}`);
  return dir;
}

/**
 * 确保数据目录存在，不存在则创建
 */
export function ensureDataDir(): string {
  const dir = getDataDir();
  try {
    console.log(`[data-dir] ensureDataDir: ${dir}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[data-dir] Created directory: ${dir}`);
    }
    fs.accessSync(dir, fs.constants.W_OK);
    console.log(`[data-dir] Directory is writable: ${dir}`);
  } catch (e: any) {
    console.error(`[data-dir] Cannot create/access data directory ${dir}: ${e.message}`);
    console.error(`[data-dir] dir exists: ${fs.existsSync(dir)}`);
    throw e;
  }
  return dir;
}

/**
 * 获取数据目录下的文件绝对路径
 * @param filename 文件名或相对路径（如 'server.log', 'ai-history/xxx.json'）
 */
export function getDataPath(...segments: string[]): string {
  return path.join(getDataDir(), ...segments);
}

/**
 * 确保指定目录存在且可写
 * - 目录不存在时递归创建
 * - 权限不足时尝试修复为 0o755
 * - 全部失败返回 false，不抛异常
 */
export function ensureDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // 检查是否可写
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      try { fs.chmodSync(dir, 0o755); } catch (_) { /* 无权限修复则忽略 */ }
    }
    return true;
  } catch (e: any) {
    console.warn(`[data-dir] Cannot create/fix directory (${dir}): ${e.message}`);
    return false;
  }
}

/**
 * 递归修复目录及文件权限：目录 755，文件 644
 */
export function fixPermissions(dir?: string): void {
  const targetDir = dir || getDataDir();
  try {
    fs.chmodSync(targetDir, 0o755);
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      try {
        if (entry.isDirectory()) {
          fixPermissions(fullPath);
        } else {
          fs.chmodSync(fullPath, 0o644);
        }
      } catch { /* 单个文件失败不影响其他 */ }
    }
  } catch { /* ignore */ }
}
