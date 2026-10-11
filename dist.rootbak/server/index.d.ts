import { ConnectionService } from './service/connection.service';
import { SSHService } from './service/ssh.service';
import { AIService } from './service/ai.service';
import { SkillService } from './service/skill.service';
import { AuditService } from './service/audit.service';
import { MonitorService } from './service/monitor.service';
import { BatchService } from './service/batch.service';
declare const connectionService: ConnectionService;
declare const sshService: SSHService;
declare const skillService: SkillService;
declare const auditService: AuditService;
declare const monitorService: MonitorService;
declare const batchService: BatchService;
declare const aiService: AIService;
/**
 * REST API 路由处理
 * 所有 API 请求通过此函数统一分发
 */
export declare function handleRoutes(pathname: string, body: any): Promise<string | boolean | import("./model/connection.entity").ConnectionEntity | string[] | import("./model/connection.entity").ConnectionEntity[] | import("./service/ssh.service").SessionInfo[] | import("./service/ssh.service").RemoteFileInfo[] | import("./service/audit.service").AuditStats | {
    entries: import("./service/audit.service").AuditEntry[];
    total: number;
} | import("./service/ai.service").AIConfig | import("./service/ai.service").DisplayMessage[] | {
    success: boolean;
    message: string;
} | import("./service/ai.service").HistoryMeta[] | import("./service/skill.service").Skill | import("./service/skill.service").Skill[] | import("./service/monitor.service").MonitorAlert[] | {
    monitorId: string;
} | {
    monitorId: string;
    sessionId: string;
    connectionId: string;
    logPath: string;
    lineCount: number;
    alertCount: number;
    running: boolean;
}[] | import("./service/batch.service").BatchTask | import("./service/batch.service").BatchTask[]>;
export { connectionService, sshService, aiService, skillService, auditService, monitorService, batchService };
//# sourceMappingURL=index.d.ts.map