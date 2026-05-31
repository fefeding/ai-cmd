import { ConnectionService } from './service/connection.service';
import { SSHService } from './service/ssh.service';
import { AIService } from './service/ai.service';
import { SkillService } from './service/skill.service';
import { AuditService } from './service/audit.service';
import { MonitorService } from './service/monitor.service';
import { BatchService } from './service/batch.service';

// 初始化服务实例
const connectionService = new ConnectionService();
const sshService = new SSHService(connectionService);
const skillService = new SkillService();
const auditService = new AuditService();
const monitorService = new MonitorService(connectionService);
const batchService = new BatchService(sshService, connectionService);
const aiService = new AIService(sshService, skillService, auditService);

// 初始化
connectionService.init();

/**
 * REST API 路由处理
 * 所有 API 请求通过此函数统一分发
 */
export async function handleRoutes(pathname: string, body: any) {
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

    // 测试连接
    if (pathname === '/api/connection/testConnection') {
      return await connectionService.testConnection(body);
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

    throw Error('API endpoint not found');
  } catch (error: any) {
    if (error?.detail) error.message += ' ' + error.detail;
    throw error;
  }
}

// 导出服务实例供 WebSocket 使用
export { connectionService, sshService, aiService, skillService, auditService, monitorService, batchService };
