// 为 VSCode 扩展打包准备自包含的后端运行时（runtime/）。
//
// 扩展激活时会从 `<extension>/runtime/` 启动 AICmd 后端（见 src/server-launcher.ts
// 与 src/extension.ts 的 resolveProjectRoot）。本脚本把以下内容拷进
// packages/vscode/runtime/，使其随 vsix 一起分发，从而实现「安装即可用」：
//   - server.js           后端入口（根目录）
//   - dist/               前端静态资源(dist/public) + 编译后的服务端(dist/server)
//   - node_modules/       生产依赖（express/ws/ssh2/...）
//
// ============ 两种模式 ============
// 默认（便携模式 / portable）：
//   以 `--ignore-scripts` 安装生产依赖，不构建任何原生模块。
//   → runtime 为纯 JS，一个 vsix 可同时覆盖 Linux / macOS / Windows，
//     也不受 Node ABI 影响（扩展会用宿主 Electron / nvm / 系统 node 启动后端，
//     原生模块的 ABI 无法同时匹配这些运行时）。
//   → SSH 功能完整（ssh2 为纯 JS）；本地 Shell 自动降级到 child_process
//     （见 server/service/ssh.service.ts 中 node-pty 的 try/catch 与降级分支）。
//
// --with-pty（PTY 模式）：
//   正常安装并构建原生模块，得到完整 PTY 的本地终端。
//   → 该 vsix 与「打包机的 OS/架构 + 该 Node ABI」绑定，仅适用于同一平台，
//     不能作为跨平台通用包发布。如需覆盖多平台，必须按平台分别打包。
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const vscodeDir = join(root, 'packages', 'vscode');
const runtimeDir = join(vscodeDir, 'runtime');

// --with-pty: 构建原生模块（完整 PTY，但产物与打包平台绑定）
const withPty = process.argv.includes('--with-pty');

function fail(msg) {
  console.error('[prepare-vscode-runtime] ' + msg);
  process.exit(1);
}

// 1) 校验前置构建产物
const serverJs = join(root, 'server.js');
const distDir = join(root, 'dist');
if (!existsSync(serverJs)) fail('未找到根目录 server.js，请先执行 `pnpm build-only`');
if (!existsSync(distDir)) fail('未找到 dist/，请先执行 `pnpm build-only`');
if (!existsSync(join(distDir, 'server', 'index.js')))
  fail('未找到 dist/server/index.js，请先执行 `pnpm build-only`');

// 2) 清空并重建 runtime 目录
if (existsSync(runtimeDir)) rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

// 3) 拷贝 server.js 与 dist/
cpSync(serverJs, join(runtimeDir, 'server.js'));
cpSync(distDir, join(runtimeDir, 'dist'), { recursive: true });
console.log('[prepare-vscode-runtime] copied server.js + dist/');

// 4) 生成 runtime/package.json（仅生产依赖）
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const runtimePkg = {
  name: 'aicmd-runtime',
  private: true,
  version: '0.0.0',
  description: 'Bundled AICmd backend runtime for the VSCode extension.',
  license: rootPkg.license || 'MIT',
  dependencies: rootPkg.dependencies || {},
};
writeFileSync(
  join(runtimeDir, 'package.json'),
  JSON.stringify(runtimePkg, null, 2) + '\n'
);

// 5) 安装生产依赖
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (withPty) {
  console.warn(
    '[prepare-vscode-runtime] PTY 模式：将构建原生模块，产物仅适用于 ' +
      `${process.platform}/${process.arch}，不可作为跨平台通用包发布。`
  );
  execFileSync(
    npm,
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'],
    { cwd: runtimeDir, stdio: 'inherit' }
  );
} else {
  console.log(
    '[prepare-vscode-runtime] 便携模式：忽略构建脚本，产出跨平台纯 JS 运行时 ' +
      '（本地 Shell 将降级为 child_process，SSH 功能不受影响）。'
  );
  execFileSync(
    npm,
    [
      'install',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
    ],
    { cwd: runtimeDir, stdio: 'inherit' }
  );
}

console.log(
  '[prepare-vscode-runtime] runtime prepared at ' +
    runtimeDir +
    (withPty ? ' (PTY 模式)' : ' (便携模式)')
);
