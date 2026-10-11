"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionEntity = void 0;
/**
 * 连接配置实体
 * 实际数据保存在本地 JSON 文件中（~/.aicmd/connections.json）
 */
class ConnectionEntity {
    /** 连接 ID */
    id;
    /** 连接名称 */
    name;
    /** 连接类型：ssh 或 local（本地 shell） */
    type = 'ssh';
    /** 主机地址 */
    host;
    /** SSH 端口，默认 22 */
    port = 22;
    /** 用户名 */
    username;
    /** 认证方式：password（密码）、privateKey（私钥）、auto（自动使用本机密钥） */
    authType = 'auto';
    /** 密码（加密存储） */
    password;
    /** 私钥内容 */
    privateKey;
    /** 私钥密码 */
    passphrase;
    /** 本地 shell 路径（仅 type='local' 时使用） */
    shell;
    /** 连接后自动执行的脚本（如跳板机跳转命令） */
    startupScript;
    /** 是否启用 SSH Agent 转发（用于跳板机密钥认证） */
    forwardAgent;
    /** 终端配置 */
    terminal = {
        cols: 80,
        rows: 24,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: 'dark',
        cursorStyle: 'block',
    };
    /** 扩展选项（keepalive 间隔等） */
    options = {};
    /** 是否启用 */
    enabled = true;
    /** 创建时间 */
    createdAt = new Date();
    /** 更新时间 */
    updatedAt = new Date();
}
exports.ConnectionEntity = ConnectionEntity;
//# sourceMappingURL=connection.entity.js.map