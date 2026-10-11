// 为 VSCode 扩展打包准备自包含的后端运行时（runtime/）。
//
// 扩展激活时会从 `<extension>/runtime/` 启动 AICmd 后端（见 src/server-launcher.ts
// 与 src/extension.ts 的 resolveProjectRoot）。本脚本把以下内容放进
// packages/vscode/runtime/，使其随 vsix 一起分发，实现「安装即可用」：
//   - server.js           后端入口（根目录）
//   - dist/               前端静态资源(dist/public) + 编译后的服务端(dist/server)
//   - node_modules/       生产依赖（express/ws/ssh2/node-pty/...）
//
// ============ 跨平台原生模块策略 ============
// node-pty 是原生模块，但 @1.2.0-beta.13 具备两个关键特性，使「单一 vsix 覆盖多
// 平台且保留完整 PTY」成为可能：
//
// 1) N-API（依赖只有 node-addon-api，无 nan）→ 二进制在 Node 各版本间 ABI 稳定。
//    扩展会用宿主 Electron / nvm / 系统 node 启动后端，ABI 各不相同，只有 N-API
//    才能用同一份二进制覆盖。
// 2) npm 包内已内置全平台预编译 prebuilds/<platform>-<arch>/：
//      darwin-arm64、darwin-x64、linux-arm64、linux-x64、win32-x64、win32-arm64
//    其 lib/utils.js 的 loadNativeModule 会依次尝试
//      build/Release → build/Debug → prebuilds/<platform>-<arch>
//    运行时自动按 process.platform/arch 选中，无需任何代码改动。
//
// 因此这里以 `--ignore-scripts` 安装：跳过编译（node-pty 的 prebuild.js 只是检查
// 预编译是否存在，post-install.js 只处理 build/Release，与 prebuilds 无关），
// 完整保留包内所有平台的预编译二进制。
//
// 兜底：若某平台缺少预编译，server/service/ssh.service.ts 中 node-pty 的
// try/catch 会让本地 Shell 降级到 child_process，不会导致扩展无法启动。
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
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

/** 递归遍历目录，返回所有文件路径。 */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/** 需要保留可执行权限的辅助可执行文件（npm 解包一般会保留，但显式加固）。 */
const EXECUTABLE_NAMES = new Set(['spawn-helper', 'OpenConsole.exe']);

/**
 * 后处理 node-pty 的 prebuilds：
 *  - 删除 Windows 调试符号 *.pdb（约 21MB，运行时不需要）
 *  - 为 spawn-helper / OpenConsole.exe 补可执行权限
 */
function postProcessPrebuilds(ptyDir) {
  const prebuildsDir = join(ptyDir, 'prebuilds');
  if (!existsSync(prebuildsDir)) {
    console.warn(
      '[prepare-vscode-runtime] 警告：node-pty 未包含 prebuilds/，' +
        '本地 Shell 将降级为 child_process（SSH 不受影响）。'
    );
    return;
  }

  const platforms = readdirSync(prebuildsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.log(
    '[prepare-vscode-runtime] node-pty 预编译平台: ' +
      (platforms.join(', ') || '(无)')
  );

  for (const file of listFiles(prebuildsDir)) {
    const name = file.split(/[\\/]/).pop();
    if (name.endsWith('.pdb')) {
      unlinkSync(file);
      continue;
    }
    if (EXECUTABLE_NAMES.has(name)) {
      try {
        chmodSync(file, 0o755);
      } catch {
        /* Windows 上 chmod 无意义，忽略 */
      }
    }
  }
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

// 5) 安装生产依赖：--ignore-scripts 保留 node-pty 包内全平台预编译，不触发编译
console.log('[prepare-vscode-runtime] installing production deps (keep prebuilds)...');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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

// 6) 后处理 node-pty 预编译（去调试符号 + 补可执行位）
const ptyDir = join(runtimeDir, 'node_modules', 'node-pty');
if (existsSync(ptyDir)) postProcessPrebuilds(ptyDir);
else
  console.warn(
    '[prepare-vscode-runtime] 警告：runtime 内缺少 node-pty，本地 Shell 将降级。'
  );

console.log('[prepare-vscode-runtime] runtime prepared at ' + runtimeDir);
