#!/usr/bin/env node

const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');

// ============================================================
// 统一数据目录管理（与 server/utils/data-dir.ts 保持一致）
// 所有写入文件必须通过 getDataPath() 获取路径
// ============================================================

/** 获取数据目录路径 */
function getDataDir() {
  return process.env.AICMD_DATA_DIR || path.join(os.homedir(), '.aicmd');
}

/** 获取数据目录下的文件路径 */
function getDataPath(...segments) {
  return path.join(getDataDir(), ...segments);
}

/** 递归修复权限：目录 755，文件 644 */
function fixPermissions(dir) {
  try {
    fs.chmodSync(dir, 0o755);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) fixPermissions(fullPath);
        else fs.chmodSync(fullPath, 0o644);
      } catch { /* 单个文件失败不影响其他 */ }
    }
  } catch { /* ignore */ }
}

/** 确保数据目录存在且可写 */
function ensureDataDir() {
  const dir = getDataDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    } else {
      try { fs.accessSync(dir, fs.constants.W_OK); } catch {
        fixPermissions(dir);
        try { fs.accessSync(dir, fs.constants.W_OK); } catch {
          throw new Error(`Permission denied even after chmod: ${dir}`);
        }
      }
    }
  } catch (e) {
    console.error(`Cannot access data directory ${dir}: ${e.message}`);
    console.error('Try: sudo chown -R $(whoami) ' + dir);
    process.exit(1);
  }
  return dir;
}

// PID 文件操作
const readPid = () => {
  const f = getDataPath('aicmd.server.pid');
  return fs.existsSync(f) ? parseInt(fs.readFileSync(f, 'utf8')) : null;
};
const getAccessToken = () => {
  if (process.env.AICMD_ACCESS_TOKEN) return process.env.AICMD_ACCESS_TOKEN;
  ensureDataDir();
  const f = getDataPath('access-token');
  try {
    if (fs.existsSync(f)) {
      const token = fs.readFileSync(f, 'utf8').trim();
      if (token) return token;
    }
  } catch { /* ignore */ }
  const token = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(f, token, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(f, 0o600); } catch { /* ignore */ }
  return token;
};
const writePid = (pid) => {
  ensureDataDir();
  fs.writeFileSync(getDataPath('aicmd.server.pid'), pid.toString());
};
const deletePid = () => {
  const f = getDataPath('aicmd.server.pid');
  if (fs.existsSync(f)) fs.unlinkSync(f);
};

const args = process.argv.slice(2);
const command = args[0] || 'help';
const commandArgs = args.slice(1);

switch (command) {
  case 'start': startProject(); break;
  case 'stop': stopProject(); break;
  case 'restart': restartProject(); break;
  case '-v':
  case '--version': showVersion(); break;
  default: showHelp(); break;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port);
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  for (let i = 0; i < 100; i++) {
    if (await isPortAvailable(port)) return port;
    port++;
  }
  throw new Error(`Cannot find available port, tried 100 times`);
}

async function startProject() {
  console.log('Starting aicmd...');

  const pid = readPid();
  if (pid) {
    try {
      process.kill(pid, 0);
      console.log('Server is already running with PID:', pid);
      return;
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.log('Cleaning up stale PID file...');
        deletePid();
      }
    }
  }

  let port = 9801;
  const portIndex = commandArgs.findIndex(arg => arg === '-p' || arg === '--port');
  if (portIndex !== -1 && commandArgs[portIndex + 1]) {
    port = parseInt(commandArgs[portIndex + 1]);
  }

  try {
    port = await findAvailablePort(port);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  ensureDataDir();
  const logFilePath = getDataPath('server.log');
  let logFileFd;
  try {
    logFileFd = fs.openSync(logFilePath, 'a');
  } catch (e) { /* ignore */ }

  const child = spawn('node', ['server.js', '-p', port.toString()], {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', logFileFd || 'inherit', logFileFd || 'inherit']
  });

  child.unref();
  writePid(child.pid);

  const accessToken = getAccessToken();
  const startUrl = `http://localhost:${port}/?token=${encodeURIComponent(accessToken)}`;
  console.log('Server started with PID:', child.pid);
  console.log(`aicmd is running at http://localhost:${port}`);
  openBrowser(startUrl);
}

function stopProject() {
  console.log('Stopping aicmd...');
  const pid = readPid();
  if (!pid) {
    console.log('No server process found');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    deletePid();
    console.log('Server stopped');
  } catch (error) {
    if (error.code === 'ESRCH') {
      deletePid();
    }
    console.error('Failed to stop:', error.message);
  }
}

function restartProject() {
  stopProject();
  for (let i = 0; i < 10; i++) {
    if (!readPid()) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  startProject();
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', url] : [url];
  const proc = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: platform === 'win32' });
  proc.unref();
}

function showVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  console.log(pkg.version);
}

function showHelp() {
  console.log('aicmd - AI-powered SSH Terminal');
  console.log('');
  console.log('Usage:');
  console.log('  aicmd start    Start the server');
  console.log('  aicmd stop     Stop the server');
  console.log('  aicmd restart  Restart the server');
  console.log('  aicmd -v       Show version');
  console.log('');
}
