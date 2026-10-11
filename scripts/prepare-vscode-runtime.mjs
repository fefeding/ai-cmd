// 为 VSCode 扩展打包准备自包含的后端运行时（runtime/）。
//
// 扩展激活时会从 `<extension>/runtime/` 启动 AICmd 后端（见 src/server-launcher.ts
// 与 src/extension.ts 的 resolveProjectRoot）。本脚本把以下内容拷进
// packages/vscode/runtime/，使其随 vsix 一起分发，从而实现「安装即可用」：
//   - server.js           后端入口（根目录）
//   - dist/               前端静态资源(dist/public) + 编译后的服务端(dist/server)
//   - node_modules/       生产依赖（express/ws/ssh2/node-pty/...），按当前平台构建
//
// 注意：node-pty / ssh2 是原生模块，runtime/node_modules 必须由「目标平台」的
// 包管理器构建。本脚本在 runtime/ 内用 npm 重新安装生产依赖，会拉取/编译与
// 当前机器平台匹配的预编译二进制。因此：
//   - 在 macOS 上本地 `pnpm vscode:package` → 得到含 macOS 原生模块的 vsix，可本地安装测试；
//   - CI(Linux) 打包 → 含 Linux 原生模块，适用于 Linux 环境的 VSCode。
// 跨平台发布的单 vsix 无法同时覆盖三端，需要按平台分别打包。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const vscodeDir = join(root, 'packages', 'vscode');
const runtimeDir = join(vscodeDir, 'runtime');

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

// 4) 生成 runtime/package.json（仅生产依赖，让 npm 在目标平台安装并构建原生模块）
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

// 5) 在 runtime/ 内安装生产依赖（npm 产出真实、可随 vsix 分发的 node_modules）
console.log('[prepare-vscode-runtime] installing production deps (platform native modules)...');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(
  npm,
  ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'],
  { cwd: runtimeDir, stdio: 'inherit' }
);

console.log('[prepare-vscode-runtime] runtime prepared at ' + runtimeDir);
