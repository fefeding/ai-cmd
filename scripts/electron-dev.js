/**
 * @file Electron 开发模式启动脚本
 * @description 启动 Vite 开发服务器，然后启动 Electron 窗口指向 Vite
 *
 * 用法: node scripts/electron-dev.js
 */

const { exec, spawn } = require('child_process');
const { resolve } = require('path');
const os = require('os');

const projectRoot = resolve(__dirname, '..');
const preferredPort = process.env.VITE_PORT || 9801;
const isWindows = os.platform() === 'win32';
let viteUrl = null;
let electronProcess = null;

// 启动 Vite 开发服务器（加大 maxBuffer 避免长时间运行溢出）
const viteProcess = exec('npm run dev', {
  cwd: projectRoot,
  maxBuffer: 10 * 1024 * 1024,
  env: { ...process.env, VITE_PORT: String(preferredPort) },
});

let readyTimer = null;

// 去除 ANSI 转义码，避免干扰正则匹配
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

// 同时监听 stdout 和 stderr，Vite v8 可能将 URL 信息输出到 stderr
function handleOutput(data) {
  const raw = data.toString();
  console.log(raw);

  const output = stripAnsi(raw);

  // 从 Vite 输出中解析实际端口（如 "Local: http://localhost:9804/"）
  const localMatch = output.match(/Local:\s+https?:\/\/localhost:(\d+)/);
  if (localMatch) {
    viteUrl = `http://localhost:${localMatch[1]}`;
    console.log(`[electron-dev] Detected Vite URL: ${viteUrl}`);
    // 延迟启动 Electron，等 Vite 完全就绪
    if (!readyTimer) {
      readyTimer = setTimeout(() => {
        console.log(`[electron-dev] Starting Electron...`);
        startElectron();
      }, 1500);
    }
  }
}

viteProcess.stdout.on('data', handleOutput);
viteProcess.stderr.on('data', handleOutput);
viteProcess.on('close', (code) => console.log(`[electron-dev] Vite exited: ${code}`));

// 超时兜底：30秒内未匹配到 Vite URL，尝试使用默认端口
const FALLBACK_TIMEOUT = 30000;
const fallbackTimer = setTimeout(() => {
  if (!viteUrl && !readyTimer) {
    console.warn(`[electron-dev] Timeout: Vite URL not detected after ${FALLBACK_TIMEOUT / 1000}s, falling back to port ${preferredPort}`);
    viteUrl = `http://localhost:${preferredPort}`;
    console.log(`[electron-dev] Starting Electron with fallback URL: ${viteUrl}`);
    startElectron();
  }
}, FALLBACK_TIMEOUT);

function startElectron() {
  if (electronProcess || !viteUrl) return; // 避免重复启动或 URL 未就绪

  const electronBin = require('electron');
  const mainScript = resolve(projectRoot, 'electron', 'main.js');

  electronProcess = spawn(electronBin, [mainScript, `--dev-url=${viteUrl}`], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ELECTRON_DEV: '1' },
  });

  electronProcess.on('close', (code) => {
    console.log(`[electron-dev] Electron exited: ${code}`);
    killProcessTree(viteProcess);
    process.exit(code || 0);
  });

  electronProcess.on('error', (err) => {
    console.error('[electron-dev] Failed to start Electron:', err);
    killProcessTree(viteProcess);
    process.exit(1);
  });
}

// 杀进程树（Windows 下需要 taskkill 清理子进程，避免端口残留）
function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  if (isWindows && proc.pid) {
    try {
      exec(`taskkill /pid ${proc.pid} /T /F`, { timeout: 5000 });
    } catch (e) { /* ignore */ }
  } else {
    proc.kill('SIGTERM');
  }
}

// 信号处理
function cleanup() {
  clearTimeout(fallbackTimer);
  clearTimeout(readyTimer);
  if (electronProcess) killProcessTree(electronProcess);
  killProcessTree(viteProcess);
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
