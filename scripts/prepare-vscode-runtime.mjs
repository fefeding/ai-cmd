// 为 VSCode 扩展打包准备自包含的后端运行时（runtime/）。
//
// 扩展激活时会从 `<extension>/runtime/` 启动 AICmd 后端（见 src/server-launcher.ts
// 与 src/extension.ts 的 resolveProjectRoot）。本脚本把以下内容放进
// packages/vscode/runtime/，使其随 vsix 一起分发，实现「安装即可用」：
//   - server.js           后端入口（根目录，已由 esbuild 打包为单文件）
//   - dist/               前端静态资源(dist/public) + SPA 视图(dist/view)
//   - node_modules/       仅 node-pty 及其原生预编译（其余后端依赖已内联进 server.js）
//
// ============ 后端打包策略 ============
// server.js 连同其全部 JS 依赖（express / ws / ssh2 / @cicctencent/agent-core /
// axios / uuid / dotenv / js-tiktoken 等）由 esbuild 打包为单一 CJS 文件，运行时
// 不再需要这些包的 node_modules，体积从 ~15MB 降到仅剩原生模块。唯一必须保留在
// node_modules 的原生模块是 node-pty（预编译 .node + 其 JS 壳）；ssh2 的可选原生
// 依赖 cpu-features 缺失时 ssh2 会自动降级到纯 JS（见其 try/catch），故一并 external。
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
// 保留包内预编译二进制。
//
// 【默认保留全部平台】CI 产出的 vsix 是「通用包」，会同时发布到 VS Code Marketplace
// 与 OpenVSX，被 mac / win / linux 用户共同安装。若按构建机平台裁剪预编译，
// 非构建平台的用户将加载不到 node-pty 原生模块，本地 Shell 会降级为 child_process
// （丢失 PTY）。故默认全平台保留；只有明确要产出「单平台专用 vsix」时，才设
// AICMD_VSCODE_PRUNE_PREBUILDS=1 裁剪到当前平台。
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
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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
 *  - 默认【保留全部平台/架构】的预编译（通用 vsix 需覆盖 mac/win/linux）；
 *      仅当显式设置 AICMD_VSCODE_PRUNE_PREBUILDS=1 时，才裁剪到当前平台以省约 1MB
 *      （注意：裁剪后该 vsix 只能用于该平台）
 *  - 删除 Windows 调试符号 *.pdb（约 21MB，运行时不需要）
 *  - 为 spawn-helper / OpenConsole.exe 补可执行权限
 */
// 默认保留全部平台（通用 vsix 必须覆盖 mac/win/linux）；设为 1 才裁剪到当前平台。
const PRUNE_PREBUILDS = process.env.AICMD_VSCODE_PRUNE_PREBUILDS === '1';
const CURRENT_PREBUILD_KEY = `${process.platform}-${process.arch}`;

function postProcessPrebuilds(ptyDir) {
  const prebuildsDir = join(ptyDir, 'prebuilds');
  if (!existsSync(prebuildsDir)) {
    console.warn(
      '[prepare-vscode-runtime] 警告：node-pty 未包含 prebuilds/，' +
        '本地 Shell 将降级为 child_process（SSH 不受影响）。'
    );
    return;
  }

  // 1) 可选裁剪：仅当显式开关时删掉非当前平台的预编译目录
  const platformDirs = readdirSync(prebuildsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  if (PRUNE_PREBUILDS) {
    for (const dir of platformDirs) {
      if (dir !== CURRENT_PREBUILD_KEY) {
        rmSync(join(prebuildsDir, dir), { recursive: true, force: true });
      }
    }
  }
  const kept = readdirSync(prebuildsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.log(
    '[prepare-vscode-runtime] node-pty 预编译平台: ' +
      (kept.join(', ') || '(无)') +
      (PRUNE_PREBUILDS ? `（已裁剪为 ${CURRENT_PREBUILD_KEY}）` : '（全平台保留）')
  );

  // 2) 删调试符号 + 补可执行权限（在保留的目录上操作）
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

// ============ node_modules 瘦身 ============
// node_modules 里大量文件运行时用不到（README / CHANGELOG / 测试 / sourcemap …）。
// 后端 JS 依赖已全部内联进 server.js，这里只针对残留的原生依赖做清理；
// 法律文件（LICENSE/COPYING/NOTICE）与 .node 二进制、头文件一律保留。
const PRUNE_DIR_NAMES = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs',
  'docs', 'doc', 'example', 'examples',
  '.github', 'coverage', '.nyc_output',
]);
const PRUNE_FILE_RE = /\.(map|tsbuildinfo)$/i;
const PRUNE_DOC_RE =
  /^(readme|changelog|changes|history|contributing|authors|codeowners)/i;
const LEGAL_FILE_RE = /^(licen[cs]e|copying|notice)(\..*)?$/i;

/** 统计文件/目录占用的字节数。 */
function sizeOf(p) {
  try {
    const st = statSync(p);
    if (!st.isDirectory()) return st.size;
    let total = 0;
    for (const f of listFiles(p)) {
      try {
        total += statSync(f).size;
      } catch {
        /* 忽略无法访问的项 */
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** 收集可删除的路径（先收集后删除，便于统计体积）。 */
function collectPrunable(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (PRUNE_DIR_NAMES.has(entry.name.toLowerCase())) {
        out.push(full);
        continue;
      }
      collectPrunable(full, out);
    } else if (PRUNE_FILE_RE.test(entry.name)) {
      out.push(full);
    } else if (PRUNE_DOC_RE.test(entry.name) && !LEGAL_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
}

/** 清理 node_modules 内的文档 / 测试 / sourcemap，返回节省的字节数。 */
function pruneNodeModules(nmDir) {
  if (!existsSync(nmDir)) return 0;
  const targets = [];
  collectPrunable(nmDir, targets);
  let saved = 0;
  let count = 0;
  for (const t of targets) {
    const size = sizeOf(t);
    try {
      rmSync(t, { recursive: true, force: true });
      saved += size;
      count++;
    } catch {
      /* 忽略删除失败的项 */
    }
  }
  console.log(
    `[prepare-vscode-runtime] pruned ${count} path(s) from node_modules, ` +
      `saved ${(saved / 1024 / 1024).toFixed(2)} MB`
  );
  return saved;
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

// 3.5) 用 esbuild 把后端入口及其全部 JS 依赖打包成单一文件，运行时 node_modules
// 仅保留原生模块（node-pty 及其实 prebuilds）。cpu-features 为 ssh2 的可选原生依赖，
// 缺失时 ssh2 自动降级到纯 JS（try/catch 兜底），故一并 external。
// esbuild 由 packages/vscode 安装，从根目录无法直接解析，这里显式从子包定位。
const requireFrom = createRequire(import.meta.url);
let build;
try {
  // 依次尝试：子包 node_modules（本地）→ 根 node_modules（CI 只装根依赖）
  const esbuildMain = requireFrom.resolve('esbuild', {
    paths: [join(root, 'packages', 'vscode'), root],
  });
  const esbuildNs = await import(esbuildMain);
  build = esbuildNs.build || (esbuildNs.default && esbuildNs.default.build);
} catch (e) {
  fail('无法解析 esbuild（请先 `pnpm install` 根目录依赖）：' + e.message);
}
console.log('[prepare-vscode-runtime] bundling backend server with esbuild...');
// 注意：esbuild 不允许 outfile 与 entry 同名（会拒绝覆盖），故先输出到临时文件，
// 确认写入成功后再覆盖 server.js。
const bundleTmp = join(runtimeDir, '.server.bundle.tmp.js');
await build({
  entryPoints: [join(runtimeDir, 'server.js')],
  outfile: bundleTmp,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node16',
  // 显式把根 node_modules 加入解析路径，确保 express/ws/ssh2/agent-core 等能被定位
  // （runtime 目录本身此刻尚无 node_modules，避免依赖隐式的向上查找）
  absWorkingDir: root,
  nodePaths: [join(root, 'node_modules')],
  // 注意：'.node' 原生二进制不能被 esbuild 打包（无对应 loader），必须 external。
  // 典型如 ssh2 自带的 sshcrypto.node —— 其 require 本身包在 try/catch 中
  // （ssh2/lib/protocol/crypto.js），缺失时自动降级为纯 JS 加密，不影响 SSH 功能。
  external: ['node-pty', 'cpu-features', '*.node'],
  // 注入打包标记：server.js 内的构建产物校验会据此跳过（dist/server 已被内联删除）
  define: { 'process.env.AICMD_BUNDLED': '"1"' },
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});
cpSync(bundleTmp, join(runtimeDir, 'server.js'));
rmSync(bundleTmp, { force: true });
console.log('[prepare-vscode-runtime] backend bundled -> runtime/server.js');

// 3.6) 已编译的服务端代码已内联进单文件，删除 runtime/dist/server 以节省体积
const distServerDir = join(runtimeDir, 'dist', 'server');
if (existsSync(distServerDir)) {
  rmSync(distServerDir, { recursive: true, force: true });
  console.log('[prepare-vscode-runtime] removed inlined dist/server');
}

// 4) 生成 runtime/package.json：后端 JS 依赖已全部内联进 server.js，node_modules
// 只需保留原生模块 node-pty（含其预编译二进制）。其余生产依赖不再安装。
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const runtimePkg = {
  name: 'aicmd-runtime',
  private: true,
  version: '0.0.0',
  description: 'Bundled AICmd backend runtime for the VSCode extension.',
  license: rootPkg.license || 'MIT',
  dependencies: { 'node-pty': rootPkg.dependencies['node-pty'] },
};
writeFileSync(
  join(runtimeDir, 'package.json'),
  JSON.stringify(runtimePkg, null, 2) + '\n'
);

// 5) 安装原生模块 node-pty：--ignore-scripts 保留其包内预编译，不触发本地编译；
//    --no-package-lock 避免把 lockfile 打进扩展包
console.log('[prepare-vscode-runtime] installing native runtime dep (node-pty)...');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(
  npm,
  [
    'install',
    '--omit=dev',
    '--ignore-scripts',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    '--loglevel=error',
  ],
  { cwd: runtimeDir, stdio: 'inherit' }
);

// 5.5) 清理 node_modules 内的文档 / 测试 / sourcemap 等运行时无用文件
pruneNodeModules(join(runtimeDir, 'node_modules'));

// 6) 后处理 node-pty 预编译（去调试符号 + 补可执行位）
const ptyDir = join(runtimeDir, 'node_modules', 'node-pty');
if (existsSync(ptyDir)) postProcessPrebuilds(ptyDir);
else
  console.warn(
    '[prepare-vscode-runtime] 警告：runtime 内缺少 node-pty，本地 Shell 将降级。'
  );

console.log('[prepare-vscode-runtime] runtime prepared at ' + runtimeDir);
