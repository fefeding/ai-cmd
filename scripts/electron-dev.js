/**
 * @file Electron 开发模式启动脚本
 * @description 启动 Vite 开发服务器，然后启动 Electron 窗口指向 Vite
 *
 * 用法: node scripts/electron-dev.js
 */

const { exec, spawn } = require('child_process');
const { resolve } = require('path');

const projectRoot = resolve(__dirname, '..');
const preferredPort = process.env.VITE_PORT || 9801;
let viteUrl = null;
let electronProcess = null;

// 启动 Vite 开发服务器
const viteProcess = exec('npm run dev', { cwd: projectRoot, env: { ...process.env, VITE_PORT: String(preferredPort) } });

let readyTimer = null;

viteProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);

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
});

viteProcess.stderr.on('data', (data) => console.error(data.toString()));
viteProcess.on('close', (code) => console.log(`[electron-dev] Vite exited: ${code}`));

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
    viteProcess.kill();
    process.exit(code || 0);
  });

  electronProcess.on('error', (err) => {
    console.error('[electron-dev] Failed to start Electron:', err);
    viteProcess.kill();
    process.exit(1);
  });
}

// 信号处理
function cleanup() {
  if (electronProcess) electronProcess.kill();
  viteProcess.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
