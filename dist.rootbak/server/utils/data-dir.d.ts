/**
 * 获取数据目录路径（统一入口）
 * 所有需要写入的文件（PID、日志、配置、会话等）都必须通过此函数获取目录
 *
 * 优先级：环境变量 AICMD_DATA_DIR > ~/.aicmd
 */
export declare function getDataDir(): string;
/**
 * 确保数据目录存在，不存在则创建
 */
export declare function ensureDataDir(): string;
/**
 * 获取数据目录下的文件绝对路径
 * @param filename 文件名或相对路径（如 'server.log', 'ai-history/xxx.json'）
 */
export declare function getDataPath(...segments: string[]): string;
/**
 * 确保指定目录存在且可写
 * - 目录不存在时递归创建
 * - 权限不足时尝试修复为 0o755
 * - 全部失败返回 false，不抛异常
 */
export declare function ensureDir(dir: string): boolean;
/**
 * 递归修复目录及文件权限：目录 755，文件 644
 */
export declare function fixPermissions(dir?: string): void;
//# sourceMappingURL=data-dir.d.ts.map