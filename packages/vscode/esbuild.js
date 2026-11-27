// 构建脚本：将扩展宿主代码 + MCP stdio 入口打包为 CJS。
// 扩展宿主供 VSCode 加载；MCP 入口供 AI 编辑器拉起，通过后端工具操作绑定的终端会话。
//
// 后端 server/ 与前端 dist/ 不在此处打包 —— 扩展在运行时以子进程方式启动
// 项目根目录下的 server.js（Express + WebSocket），并通过 WebView iframe
// 加载其提供的前端 SPA，从而完整复用 AICmd 的全部功能。
const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

async function build() {
  // 扩展宿主入口（extension + 启动器）
  const ext = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    outfile: path.join(__dirname, 'dist', 'extension.js'),
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: !production,
    minify: production,
    logLevel: 'info'
  });

  // MCP stdio 入口：由 AI 编辑器拉起，独占 stdin/stdout，后端只监听回环地址。
  const mcp = await esbuild.context({
    entryPoints: [path.join(__dirname, '..', '..', 'server', 'mcp-server.ts')],
    outfile: path.join(__dirname, 'dist', 'mcp.js'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: false,
    minify: production,
    logLevel: 'info'
  });

  if (watch) {
    await Promise.all([ext.watch(), mcp.watch()]);
    console.log('[esbuild] watching for changes… (press Ctrl+C to stop)');
    return;
  }

  await Promise.all([ext.rebuild(), mcp.rebuild()]);
  await Promise.all([ext.dispose(), mcp.dispose()]);
  console.log('[esbuild] build complete.');
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
