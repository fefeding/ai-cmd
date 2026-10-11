import { ConnectionEntity } from '../model/connection.entity';
/**
 * SSH 连接管理服务
 * 负责管理 SSH 连接配置的 CRUD，数据存储在本地 JSON 文件中
 */
export declare class ConnectionService {
    /**
     * 连接配置文件路径
     * 优先使用环境变量 AICMD_DATA_DIR，否则使用用户主目录下的 .aicmd 目录
     */
    private readonly configPath;
    private cachedKey;
    constructor();
    /**
     * 初始化服务，创建配置目录
     */
    init(): Promise<void>;
    /**
     * 获取所有 SSH 连接配置
     */
    getAllConnections(): Promise<ConnectionEntity[]>;
    /**
     * 根据 ID 获取 SSH 连接配置
     */
    getConnectionById(id: string): Promise<ConnectionEntity | null>;
    /**
     * 添加 SSH 连接配置
     */
    addConnection(connection: ConnectionEntity): Promise<ConnectionEntity>;
    /**
     * 更新 SSH 连接配置
     */
    updateConnection(id: string, updates: Partial<ConnectionEntity>): Promise<ConnectionEntity>;
    /**
     * 删除 SSH 连接配置
     */
    deleteConnection(id: string): Promise<void>;
    /**
     * 测试 SSH 连接
     */
    testConnection(connection: ConnectionEntity): Promise<boolean>;
    /**
     * 从连接实体提取 ssh2 连接配置
     * @param onLog 可选的日志回调，用于将连接过程信息推送到前端终端
     */
    getSSHConfig(connection: ConnectionEntity, onLog?: (msg: string) => void): any;
    /**
     * 获取本机 SSH 密钥（自动扫描 ~/.ssh 目录下的私钥文件）
     */
    private getLocalSSHKey;
    /**
     * Detect SSH agent socket for agent forwarding
     * - Linux/macOS: SSH_AUTH_SOCK environment variable
     * - Windows: OpenSSH agent pipe
     */
    private getSSHAgentSocket;
    /**
     * 处理私钥格式
     * ssh2 库对 OpenSSH 格式支持不完善，需要转换为 PEM 格式
     */
    private convertToPEM;
    /**
     * 使用 ssh-keygen 将 OpenSSH 格式私钥转换为 PEM 格式
     * 通过复制到临时文件来避免修改原始密钥
     */
    private convertWithSSHKeygen;
    /**
     * 保存连接配置到文件
     */
    private saveConnections;
    private encryptConnection;
    private decryptConnection;
    private getEncryptionKey;
    private encryptSecret;
    private decryptSecret;
    /**
     * 生成唯一 ID
     */
    private generateId;
}
//# sourceMappingURL=connection.service.d.ts.map