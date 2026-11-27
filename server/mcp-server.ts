#!/usr/bin/env node
/**
 * AICmd MCP Server（stdio）
 *
 * 让 AI 编辑器（CodeBuddy / Cursor / 其它支持 MCP 的 AI 编辑器）的对话，
 * 通过 MCP 只操作「用户在 AICmd 终端里显式添加到对话」的那一个终端会话。
 *
 * 设计要点：
 * - 本文件零第三方依赖（只用 Node 内置模块），因此既能随 npm 包（`aicmd mcp`）
 *   分发，也能被 esbuild 打进 VS Code 扩展（dist/mcp.js）。切勿引入会写 stdout 的模块。
 * - 这是一个「遥控器」：会话本体始终在 AICmd 后端进程里，这里只把工具调用
 *   转成后端的 HTTP 请求。工具不接收 sessionId 参数，后端也只作用于当前绑定的会话，
 *   因此对话无法触达其它连接。
 * - 后端地址来自数据目录下的 mcp-session.json（由后端在绑定时写入），每次调用都重新读取，
 *   因此用户切换绑定会话 / 后端重启换端口后无需重启本进程。
 * - 后端只监听回环地址，无 Origin 的本机请求不需要访问令牌，本进程不接触任何凭据。
 *
 * 调试：日志一律写 stderr（stdout 被协议占用）。
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SERVER_NAME = 'aicmd';
const SERVER_VERSION = '1.0.0';
const DISCOVERY_FILE = 'mcp-session.json';
/** 已支持的协议版本（后一项为最新） */
const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
/** 非执行类请求的超时 */
const REQUEST_TIMEOUT_MS = 15000;
/** 执行类请求在命令最长等待之外再给后端的余量 */
const EXEC_GRACE_MS = 15000;
const MAX_EXEC_TIMEOUT_MS = 300000;

const NO_BINDING =
  '没有 AICmd 终端被添加到当前对话。请用户在 AICmd 终端里右键 → 「添加到 AI 对话」，然后重试。\n' +
  'No AICmd terminal is attached to this conversation. ' +
  'Ask the user to right-click the AICmd terminal and choose "添加到 AI 对话" (Add to AI Chat), then retry.';

const INSTRUCTIONS =
  'AICmd operates ONLY on the single terminal session the user explicitly attached in the AICmd extension. ' +
  'AICmd 只操作用户显式添加到对话的那一个终端会话。' +
  'There is no session/connection parameter: you cannot reach any other connection. ' +
  'If tools report that nothing is attached, ask the user to right-click the AICmd terminal and choose "添加到 AI 对话". ' +
  'Commands are typed into the user\'s interactive shell and are visible to the user, who can watch and interrupt them. ' +
  'Start with session_info to learn which machine you are on; prefer session_read (no side effects) to inspect the screen. ' +
  'session_exec returns the command exit code and finishes correctly even when the command produces no output. ' +
  'If output is truncated, call session_output with the returned outputId/offset to read the rest instead of rerunning the command. ' +
  'Explain destructive operations before running them. Keep each command line under ~4000 characters (terminal input line limit).';

/** 面向用户的业务错误：以 isError 结果返回，而不是 JSON-RPC 协议错误 */
class ToolFailure extends Error {}

class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// 后端调用
// ---------------------------------------------------------------------------

function dataDir(): string {
  return process.env.AICMD_DATA_DIR || path.join(os.homedir(), '.aicmd');
}

/** 读取后端回环地址；未绑定 / 文件损坏 / 地址非回环均视为「未绑定」。 */
function readBaseUrl(): string {
  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(dataDir(), DISCOVERY_FILE), 'utf8'));
  } catch {
    throw new ToolFailure(NO_BINDING);
  }
  const baseUrl = typeof parsed?.baseUrl === 'string' ? parsed.baseUrl : '';
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ToolFailure(NO_BINDING);
  }
  // 只接受回环地址上的明文 HTTP：发现文件被篡改也不能把请求导向别处
  const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'];
  if (url.protocol !== 'http:' || !loopback.includes(url.hostname)) {
    throw new ToolFailure(NO_BINDING);
  }
  return baseUrl.replace(/\/+$/, '');
}

/** POST 后端 API，成功返回响应里的 data，业务失败抛出后端的 msg。 */
function post(pathname: string, body: unknown, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let baseUrl: string;
    try {
      baseUrl = readBaseUrl();
    } catch (e) {
      reject(e);
      return;
    }
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: new URL(baseUrl).port || 80,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            reject(new ToolFailure(`AICmd 服务返回了无法解析的响应 / Unexpected response from AICmd service (HTTP ${res.statusCode})`));
            return;
          }
          if (res.statusCode === 401) {
            reject(new ToolFailure('AICmd 服务要求访问令牌 / The AICmd service requires an access token'));
            return;
          }
          if (json && json.ret !== undefined && json.ret !== 0) {
            reject(new ToolFailure(String(json.msg || 'AICmd service error')));
            return;
          }
          resolve(json && json.data !== undefined ? json.data : json);
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new ToolFailure('连接 AICmd 服务超时 / Timed out talking to the AICmd service'));
    });
    req.on('error', (err: any) => {
      if (err instanceof ToolFailure) {
        reject(err);
        return;
      }
      reject(
        new ToolFailure(
          `无法连接 AICmd 服务（${baseUrl}）。请用户保持至少一个 AICmd 终端面板处于打开状态，然后重新添加到对话。\n` +
            `Cannot reach the AICmd service at ${baseUrl}. Ask the user to keep an AICmd terminal panel open and attach it again.`
        )
      );
    });
    req.end(payload);
  });
}

// ---------------------------------------------------------------------------
// 工具定义
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'session_info',
    description:
      'Get info about the AICmd terminal attached to this conversation: name, type (ssh/local), host and user. ' +
      'Call this first to learn which machine you are operating on. No side effects.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'session_read',
    description:
      "Read the recent output of the attached terminal WITHOUT running anything. " +
      "Use it to see what is on screen (errors, logs, a y/n prompt) before acting, or after a command produced no output. No side effects.",
    inputSchema: {
      type: 'object',
      properties: {
        lines: {
          type: 'integer',
          minimum: 10,
          maximum: 400,
          description: 'How many trailing lines to return. Default 100.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'session_output',
    description:
      'Read another chunk of the FULL output from the most recent session_exec. ' +
      'Use this when session_exec says output was truncated, instead of rerunning the command. ' +
      'Pass the offset printed in the previous chunk; the result reports the next offset and total length.',
    inputSchema: {
      type: 'object',
      properties: {
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Character offset to start from. Use the nextOffset from the previous chunk.',
        },
        length: {
          type: 'integer',
          minimum: 1000,
          maximum: 200000,
          description: 'Maximum characters to return. Default 20000.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'session_exec',
    description:
      "Run a shell command in the attached terminal. It is typed into the user's interactive shell, so the user sees it. " +
      'A completion marker is appended after the command, so silent commands (cd, true, mv) finish normally and the exit code is returned. ' +
      'The command cannot execute while a foreground program (vim, top, tail -f, a y/n prompt) owns the terminal: ' +
      'in that case the marker never appears — use session_read to inspect, session_interrupt to stop it, or ask the user. ' +
      'If the result is marked as timed out, the command may still be running and further commands are rejected ' +
      'until you call session_interrupt. ' +
      'High-risk destructive commands are blocked by AICmd. Keep each line under ~4000 characters.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
        timeoutMs: {
          type: 'integer',
          minimum: 1000,
          maximum: MAX_EXEC_TIMEOUT_MS,
          description: `Max time to wait for the command. Default 20000. Use a larger value (up to ${MAX_EXEC_TIMEOUT_MS}) for slow commands.`,
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'session_interrupt',
    description:
      'Send Ctrl+C to the attached terminal to stop the foreground command that is currently running ' +
      '(for example one that hit its time limit). The terminal stays attached.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'session_detach',
    description:
      'Detach the terminal from this conversation once the task is finished, so no further commands can run on it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  },
];

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function text(body: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: body }], ...(isError ? { isError: true } : {}) };
}

async function dispatch(params: any): Promise<ToolResult> {
  const name = String(params?.name || '');
  const rawArgs = params?.arguments;
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};
  try {
    switch (name) {
      case 'session_info': {
        const bound = await post('/api/mcp/status', {}, REQUEST_TIMEOUT_MS);
        if (!bound) return text(NO_BINDING, true);
        return text(JSON.stringify(bound, null, 2));
      }
      case 'session_read': {
        const lines = Number(args.lines);
        const output = await post(
          '/api/mcp/read',
          { lines: Number.isFinite(lines) ? lines : undefined },
          REQUEST_TIMEOUT_MS
        );
        return text(typeof output === 'string' && output.trim() ? output : '(终端暂无可读输出 / No terminal output yet)');
      }
      case 'session_output': {
        const offset = Number(args.offset);
        const length = Number(args.length);
        if (args.offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
          return text('Invalid arguments: "offset" must be a non-negative integer.', true);
        }
        if (args.length !== undefined && (!Number.isInteger(length) || length < 1000 || length > 200000)) {
          return text('Invalid arguments: "length" must be an integer between 1000 and 200000.', true);
        }
        const chunk = await post(
          '/api/mcp/output',
          { offset: Number.isInteger(offset) ? offset : undefined, length: Number.isInteger(length) ? length : undefined },
          REQUEST_TIMEOUT_MS
        );
        const nextOffset = Number(chunk?.offset || 0) + String(chunk?.output || '').length;
        let body = String(chunk?.output || '');
        body += `\n\n[outputId ${chunk?.outputId || ''} | chars ${nextOffset}/${Number(chunk?.totalLength || 0)}]`;
        if (chunk?.truncated) body += '\n[more available: call session_output with offset ' + nextOffset + ']';
        return text(body);
      }
      case 'session_exec': {
        if (typeof args.command !== 'string' || !args.command.trim()) {
          return text('Invalid arguments: "command" must be a non-empty string.', true);
        }
        let timeoutMs = Number(args.timeoutMs);
        if (args.timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_EXEC_TIMEOUT_MS)) {
          return text(`Invalid arguments: "timeoutMs" must be an integer between 1000 and ${MAX_EXEC_TIMEOUT_MS}.`, true);
        }
        if (!Number.isInteger(timeoutMs)) timeoutMs = 20000;
        const result = await post(
          '/api/mcp/exec',
          { command: args.command, timeoutMs },
          timeoutMs + EXEC_GRACE_MS
        );
        let body = String(result?.output || '');
        const header: string[] = [];
        if (result?.exitCode !== undefined) header.push(`[exit ${result.exitCode}]`);
        if (result?.timedOut) {
          header.push(
            '[等待超时：命令可能仍在运行，或终端正被前台程序（vim / top / tail -f / 交互提示）占用而未执行。' +
              '在调用 session_interrupt 之前，后续 session_exec 会被拒绝；可先用 session_read 查看屏幕。]',
            '[Timed out: the command may still be running, or a foreground program owns the terminal. ' +
              'Further session_exec calls are rejected until you call session_interrupt; use session_read to inspect.]'
          );
        } else if (!body.trim()) {
          body = '(命令已执行，无输出 / Command executed, no output)';
        }
        if (header.length) body = header.join('\n') + '\n\n' + body;
        if (result?.truncated) {
          const nextOffset = Number(result?.totalLength || 0) - String(result?.output || '').length;
          body +=
            `\n... (输出过长已截断 / output truncated; total ${result?.totalLength || 0} chars)` +
            `\n[读取剩余内容：session_output offset=${nextOffset} / Read the rest: session_output offset=${nextOffset}]`;
        }
        return text(body);
      }
      case 'session_interrupt':
        await post('/api/mcp/interrupt', {}, REQUEST_TIMEOUT_MS);
        return text('已发送 Ctrl+C / Sent Ctrl+C to the attached terminal.');
      case 'session_detach':
        await post('/api/mcp/unbind', {}, REQUEST_TIMEOUT_MS);
        return text('已解除绑定 / Terminal detached from this conversation.');
      default:
        // 未知工具属于协议层错误
        throw new RpcError(-32602, `Unknown tool: ${name}`);
    }
  } catch (e: any) {
    // 协议层错误（未知工具 / 内部错误）要作为 JSON-RPC error 返回，不能降级成工具结果
    if (e instanceof RpcError) throw e;
    return text(String(e?.message || e), true);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC（按行分隔）
// ---------------------------------------------------------------------------

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function protocolVersion(requested: unknown): string {
  const value = typeof requested === 'string' ? requested : '';
  // 客户端请求的版本受支持则原样回应，否则回落到本服务支持的最新版本
  return PROTOCOL_VERSIONS.includes(value) ? value : PROTOCOL_VERSIONS[PROTOCOL_VERSIONS.length - 1];
}

async function handleRequest(msg: any): Promise<{ result: unknown } | { error: unknown }> {
  switch (msg.method) {
    case 'initialize':
      return {
        result: {
          protocolVersion: protocolVersion(msg.params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions: INSTRUCTIONS,
        },
      };
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: TOOLS } };
    case 'tools/call':
      return { result: await dispatch(msg.params) };
    case 'resources/list':
      return { result: { resources: [] } };
    case 'resources/templates/list':
      return { result: { resourceTemplates: [] } };
    case 'prompts/list':
      return { result: { prompts: [] } };
    default:
      throw new RpcError(-32601, `Method not found: ${msg.method}`);
  }
}

/** 处理单条消息，返回需要回写的内容（通知与无效消息返回 null 或直接回错误）。 */
async function handleMessage(msg: any): Promise<unknown> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  }
  const hasId = msg.id !== undefined && msg.id !== null;
  if (typeof msg.method !== 'string') {
    // 有 id 却没有 method 属于非法请求；其余（响应等）直接忽略
    return hasId ? { jsonrpc: '2.0', id: msg.id, error: { code: -32600, message: 'Invalid Request' } } : null;
  }
  if (!hasId) return null; // 通知（notifications/initialized、notifications/cancelled 等）无需回应
  try {
    const reply = await handleRequest(msg);
    return { jsonrpc: '2.0', id: msg.id, ...reply };
  } catch (e: any) {
    const code = e instanceof RpcError ? e.code : -32603;
    return { jsonrpc: '2.0', id: msg.id, error: { code, message: String(e?.message || e) } };
  }
}

async function handleLine(line: string): Promise<void> {
  // 兼容把消息包在 Content-Length 头里的客户端：只取 JSON 所在行
  const json = line.slice(line.indexOf('{'));
  let msg: any;
  try {
    msg = JSON.parse(json);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  if (Array.isArray(msg)) {
    if (!msg.length) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }
    const replies = (await Promise.all(msg.map((m) => handleMessage(m)))).filter(Boolean);
    if (replies.length) send(replies);
    return;
  }
  const reply = await handleMessage(msg);
  if (reply) send(reply);
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

function main(): void {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleLine(line).catch((e) => process.stderr.write(`[aicmd-mcp] ${e?.message || e}\n`));
    }
  });
  // 客户端关闭 stdin 即退出
  process.stdin.on('end', () => process.exit(0));
  process.stdin.on('error', () => process.exit(0));
  // stdout 管道被关闭（客户端已退出）时不要再写，否则会以 EPIPE 崩溃
  process.stdout.on('error', () => process.exit(0));
  process.stderr.write(`[aicmd-mcp] server started (data dir: ${dataDir()})\n`);
}

main();
