import { ConnectionService } from './service/connection.service';
import { SSHService } from './service/ssh.service';
import { AIService } from './service/ai.service';
import { SkillService } from './service/skill.service';
import { AuditService } from './service/audit.service';
import { MonitorService } from './service/monitor.service';
import { BatchService } from './service/batch.service';
import { RdpService } from './service/rdp.service';
import { RdpTunnelService } from './service/rdp-tunnel.service';
import { PortForwardService } from './service/port-forward.service';
import { SSHKeyService } from './service/ssh-key.service';

// server.js 通过 dist/server/index.js 取用统一的 /ws/rdp 鉴权实现
export { validateRdpWsRequest } from './utils/rdp-ws';
export type { RdpWsAuthResult } from './utils/rdp-ws';

// 初始化服务实例
const connectionService = new ConnectionService();
const sshService = new SSHService(connectionService);
const rdpService = new RdpService(connectionService);
const rdpTunnelService = new RdpTunnelService(connectionService);
const skillService = new SkillService();
const auditService = new AuditService();
const monitorService = new MonitorService(connectionService);
const batchService = new BatchService(sshService, connectionService);
const aiService = new AIService(sshService, skillService, auditService);
const portForwardService = new PortForwardService(sshService);
const sshKeyService = new SSHKeyService(connectionService);

// 会话生命周期：端口转发随 SSH 会话自动启停
sshService.onSessionReady((sessionId, connection) => portForwardService.startAuto(sessionId, connection));
sshService.onSessionClose((sessionId) => portForwardService.stopAll(sessionId));

// 初始化
console.log('[Server] Initializing services...');
console.log(`[Server] Node version: ${process.version}, platform: ${process.platform}, arch: ${process.arch}`);
console.log(`[Server] cwd: ${process.cwd()}`);
console.log(`[Server] __dirname: ${__dirname}`);
try {
  connectionService.init();
  console.log('[Server] connectionService.init() completed');
} catch (e: any) {
  console.error(`[Server] connectionService.init() FAILED: ${e.message}`);
  console.error(e.stack);
}

/**
 * REST API 路由处理
 * 所有 API 请求通过此函数统一分发
 */
export async function handleRoutes(pathname: string, body: any) {
  console.log(`[Server] handleRoutes: ${pathname}`);
  try {
    // ========== 连接管理 ==========

    // 获取所有连接
    if (pathname === '/api/connection/getConnections') {
      return await connectionService.getAllConnections();
    }

    // 获取单个连接
    if (pathname === '/api/connection/getConnection') {
      const { id } = body;
      if (!id) throw Error('Missing parameter: id');
      return await connectionService.getConnectionById(id);
    }

    // 添加连接
    if (pathname === '/api/connection/addConnection') {
      return await connectionService.addConnection(body);
    }

    // 更新连接
    if (pathname === '/api/connection/updateConnection') {
      const { id, ...updates } = body;
      if (!id) throw Error('Missing parameter: id');
      return await connectionService.updateConnection(id, updates);
    }

    // 删除连接
    if (pathname === '/api/connection/deleteConnection') {
      const { id } = body;
      if (!id) throw Error('Missing parameter: id');
      await connectionService.deleteConnection(id);
      return true;
    }

    // 导出 / 导入连接（JSON 备份与团队共享）
    if (pathname === '/api/connection/exportConnections') {
      return await connectionService.exportConnections(body?.includeSecrets === true);
    }
    if (pathname === '/api/connection/importConnections') {
      return await connectionService.importConnections(body?.payload, body?.mode || 'update');
    }

    // 测试连接
    if (pathname === '/api/connection/testConnection') {
      return await connectionService.testConnection(body);
    }

    // ========== SSH 端口转发 / 隧道 ==========

    // 列出会话的隧道状态
    if (pathname === '/api/tunnel/list') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      return portForwardService.list(sessionId);
    }

    // 启动隧道（rule 来自连接配置）
    if (pathname === '/api/tunnel/start') {
      const { sessionId, rule } = body;
      if (!sessionId || !rule) throw Error('Missing parameter: sessionId, rule');
      await portForwardService.start(sessionId, rule);
      return portForwardService.list(sessionId);
    }

    // 停止单条隧道
    if (pathname === '/api/tunnel/stop') {
      const { sessionId, ruleId } = body;
      if (!sessionId || !ruleId) throw Error('Missing parameter: sessionId, ruleId');
      portForwardService.stop(sessionId, ruleId);
      return portForwardService.list(sessionId);
    }

    // 停止会话的全部隧道
    if (pathname === '/api/tunnel/stopAll') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      portForwardService.stopAll(sessionId);
      return true;
    }

    // ========== SSH 密钥管理 ==========

    if (pathname === '/api/ssh-key/list') {
      return sshKeyService.list();
    }

    if (pathname === '/api/ssh-key/generate') {
      return await sshKeyService.generate(body);
    }

    if (pathname === '/api/ssh-key/import') {
      return await sshKeyService.import(body);
    }

    if (pathname === '/api/ssh-key/getPrivateKey') {
      const { id } = body;
      if (!id) throw Error('Missing parameter: id');
      const result = sshKeyService.getPrivateKey(id);
      if (!result) throw Error('密钥不存在');
      return result;
    }

    if (pathname === '/api/ssh-key/delete') {
      const { id } = body;
      if (!id) throw Error('Missing parameter: id');
      return sshKeyService.delete(id);
    }

    if (pathname === '/api/ssh-key/distribute') {
      return await sshKeyService.distribute(body);
    }

    // ========== 终端管理（REST 部分，WebSocket 在 server.js 处理） ==========

    // 获取活跃会话列表
    if (pathname === '/api/terminal/getSessions') {
      return sshService.getSessions();
    }

    // 重命名会话
    if (pathname === '/api/terminal/renameSession') {
      const { sessionId, name } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      sshService.renameSession(sessionId, name);
      return true;
    }

    // 删除会话（从 server 端移除 metadata）
    if (pathname === '/api/terminal/deleteSession') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      sshService.deleteSession(sessionId);
      return true;
    }

    // 关闭指定会话
    if (pathname === '/api/terminal/closeSession') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      sshService.closeSession(sessionId);
      return true;
    }

    // 关闭所有会话
    if (pathname === '/api/terminal/closeAllSessions') {
      sshService.closeAllSessions();
      return true;
    }

    // ========== AI 配置 ==========

    // 获取 AI 配置
    if (pathname === '/api/ai/getConfig') {
      return aiService.getConfig();
    }

    // 更新 AI 配置
    if (pathname === '/api/ai/updateConfig') {
      return aiService.updateConfig(body);
    }

    // 测试 AI 配置
    if (pathname === '/api/ai/testConfig') {
      return await aiService.testConfig(body);
    }

    // AI 对话（非流式）
    if (pathname === '/api/ai/chat') {
      const { sessionId, message, context } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      if (!message) throw Error('Missing parameter: message');
      return await aiService.chat(sessionId, message, context);
    }

    // 清空 AI 对话历史
    if (pathname === '/api/ai/clearHistory') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      aiService.clearHistory(sessionId);
      return true;
    }

    // 获取 Session 的系统环境信息
    if (pathname === '/api/ai/getSystemContext') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      return await sshService.getSystemContext(sessionId);
    }

    // 获取 AI 对话显示历史（前端恢复用）
    if (pathname === '/api/ai/getDisplayHistory') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      return aiService.loadDisplayHistory(sessionId);
    }

    // 保存 AI 对话显示历史
    if (pathname === '/api/ai/saveDisplayHistory') {
      const { sessionId, messages, sessionName } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      if (!messages) throw Error('Missing parameter: messages');
      aiService.saveDisplayHistory(sessionId, messages, sessionName);
      return true;
    }

    // 列出所有历史对话（仅元数据）
    if (pathname === '/api/ai/listHistories') {
      return aiService.listDisplayHistories();
    }

    // 加载指定历史对话的完整消息
    if (pathname === '/api/ai/loadHistory') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      return aiService.loadDisplayHistory(sessionId);
    }

    // 删除指定历史对话
    if (pathname === '/api/ai/deleteHistory') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      aiService.deleteDisplayHistoryFile(sessionId);
      return true;
    }

    // 获取 Skills 列表
    if (pathname === '/api/ai/getSkills') {
      return skillService.getSkills();
    }

    // 获取指定 Skill
    if (pathname === '/api/ai/getSkill') {
      const { id } = body;
      if (!id) throw Error('Missing parameter: id');
      const skill = skillService.getSkill(id);
      if (!skill) throw Error('Skill not found: ' + id);
      return skill;
    }

    // ========== 审计日志 ==========

    // 查询审计日志
    if (pathname === '/api/audit/list') {
      return auditService.getLogs(body);
    }

    // 获取审计统计
    if (pathname === '/api/audit/stats') {
      return auditService.getStats(body?.date);
    }

    // 导出审计日志
    if (pathname === '/api/audit/export') {
      const { startDate, endDate, format } = body;
      if (!startDate || !endDate) throw Error('Missing parameters: startDate, endDate');
      return auditService.exportLogs(startDate, endDate, format || 'json');
    }

    // 获取可用审计日期列表
    if (pathname === '/api/audit/dates') {
      return auditService.getAvailableDates();
    }

    // ========== 日志监控 ==========

    // 启动日志监控
    if (pathname === '/api/monitor/start') {
      const { sessionId, connectionId, logPath, pattern } = body;
      if (!sessionId || !logPath) throw Error('Missing parameters: sessionId, logPath');
      return await monitorService.startMonitor(sessionId, connectionId || '', logPath, pattern);
    }

    // 停止日志监控
    if (pathname === '/api/monitor/stop') {
      const { monitorId } = body;
      if (!monitorId) throw Error('Missing parameter: monitorId');
      return monitorService.stopMonitor(monitorId);
    }

    // 获取活跃监控列表
    if (pathname === '/api/monitor/list') {
      return monitorService.getActiveMonitors(body?.sessionId);
    }

    // 获取监控告警
    if (pathname === '/api/monitor/alerts') {
      const { monitorId, limit } = body;
      if (!monitorId) throw Error('Missing parameter: monitorId');
      return monitorService.getAlerts(monitorId, limit);
    }

    // 获取监控最近行
    if (pathname === '/api/monitor/lines') {
      const { monitorId, limit } = body;
      if (!monitorId) throw Error('Missing parameter: monitorId');
      return monitorService.getRecentLines(monitorId, limit);
    }

    // 获取监控批量行（供 AI 分析）
    if (pathname === '/api/monitor/analyze') {
      const { monitorId } = body;
      if (!monitorId) throw Error('Missing parameter: monitorId');
      return monitorService.getBatchForAnalysis(monitorId);
    }

    // ========== 批量操作 ==========

    // 执行批量命令
    if (pathname === '/api/batch/execute') {
      const { sessionIds, command, timeout } = body;
      if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
        throw Error('Missing parameter: sessionIds (non-empty array)');
      }
      if (!command) throw Error('Missing parameter: command');
      return await batchService.executeBatch(sessionIds, command, timeout);
    }

    // 获取批量任务结果
    if (pathname === '/api/batch/result') {
      const { taskId } = body;
      if (!taskId) throw Error('Missing parameter: taskId');
      return batchService.getTask(taskId);
    }

    // 获取所有批量任务
    if (pathname === '/api/batch/tasks') {
      return batchService.getTasks();
    }

    // ========== 文件管理（SFTP / 本地 fs） ==========

    // 列出目录内容
    if (pathname === '/api/file/list') {
      const { sessionId, path: remotePath } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      return await sshService.listDirectory(sessionId, remotePath || '/');
    }

    // 创建目录
    if (pathname === '/api/file/mkdir') {
      const { sessionId, path: remotePath } = body;
      if (!sessionId || !remotePath) throw Error('Missing parameter: sessionId, path');
      await sshService.makeDirectory(sessionId, remotePath);
      return true;
    }

    // 删除文件或目录
    if (pathname === '/api/file/remove') {
      const { sessionId, path: remotePath } = body;
      if (!sessionId || !remotePath) throw Error('Missing parameter: sessionId, path');
      await sshService.removePath(sessionId, remotePath);
      return true;
    }

    // 重命名 / 移动
    if (pathname === '/api/file/rename') {
      const { sessionId, oldPath, newPath } = body;
      if (!sessionId || !oldPath || !newPath) throw Error('Missing parameter: sessionId, oldPath, newPath');
      await sshService.renamePath(sessionId, oldPath, newPath);
      return true;
    }

    // 获取会话默认目录（home）
    if (pathname === '/api/file/defaultDir') {
      const { sessionId } = body;
      if (!sessionId) throw Error('Missing parameter: sessionId');
      return await sshService.getDefaultDirectory(sessionId);
    }

    // RDP: 会话状态（IronRDP-WASM 隧道，不再依赖 guacd）
    if (pathname === '/api/rdp/getSessions') {
      return rdpTunnelService.getSessions();
    }

    throw Error('API endpoint not found');
  } catch (error: any) {
    if (error?.detail) error.message += ' ' + error.detail;
    throw error;
  }
}

// 导出服务实例供 WebSocket 使用
export { connectionService, sshService, rdpService, rdpTunnelService, aiService, skillService, auditService, monitorService, batchService, portForwardService, sshKeyService };
