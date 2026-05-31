#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');

/**
 * 递归修复目录及所有文件权限：目录 755，文件 644
 */
function fixPermissions(dir) {
  try {
    fs.chmodSync(dir, 0o755);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          fixPermissions(fullPath);
        } else {
          fs.chmodSync(fullPath, 0o644);
        }
      } catch { /* 单个文件失败不影响其他 */ }
    }
  } catch { /* ignore */ }
}

function ensureDataDir() {
  const dataDir = process.env.AICMD_DATA_DIR || path.join(os.homedir(), '.aicmd');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    } else {
      // 确保整个数据目录可写，递归修复权限
      try {
        fs.accessSync(dataDir, fs.constants.W_OK);
      } catch {
        fixPermissions(dataDir);
        // 再次检查
        try { fs.accessSync(dataDir, fs.constants.W_OK); } catch {
          throw new Error(`Permission denied even after chmod: ${dataDir}`);
        }
      }
    }
  } catch (e) {
    console.error(`Cannot access data directory ${dataDir}: ${e.message}`);
    console.error('Try: sudo chown -R $(whoami) ' + dataDir);
    process.exit(1);
  }
  return dataDir;
}

function getPidFilePath() {
  const dataDir = ensureDataDir();
  return path.join(dataDir, 'aicmd.server.pid');
}

function readPid() {
  const pidFilePath = getPidFilePath();
  if (fs.existsSync(pidFilePath)) {
    return parseInt(fs.readFileSync(pidFilePath, 'utf8'));
  }
  return null;
}

function writePid(pid) {
  const pidFilePath = getPidFilePath();
  try {
    fs.writeFileSync(pidFilePath, pid.toString());
  } catch (e) {
    // 尝试修复权限后重试
    try { fs.chmodSync(pidFilePath, 0o644); } catch { /* ignore */ }
    try {
      fs.writeFileSync(pidFilePath, pid.toString());
    } catch (e2) {
      console.error(`Cannot write PID file ${pidFilePath}: ${e2.message}`);
      console.error('Try: sudo chown -R $(whoami) ' + path.dirname(pidFilePath));
      process.exit(1);
    }
  }
}

function deletePid() {
  const pidFilePath = getPidFilePath();
  if (fs.existsSync(pidFilePath)) {
    fs.unlinkSync(pidFilePath);
  }
}

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

  const logFilePath = path.join(projectRoot, 'server.log');
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

  console.log('Server started with PID:', child.pid);
  console.log(`aicmd is running at http://localhost:${port}`);
  openBrowser(`http://localhost:${port}`);
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
