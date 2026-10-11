// 构建脚本：将扩展宿主代码（仅 extension 入口 + 启动器）打包为 CJS，
// 供 VSCode 扩展宿主加载。
//
// 后端 server/ 与前端 dist/ 不在此处打包 —— 扩展在运行时以子进程方式启动
// 项目根目录下的 server.js（Express + WebSocket），并通过 WebView iframe
// 加载其提供的前端 SPA，从而完整复用 AICmd 的全部功能。
const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

async function build() {
  const ctx = await esbuild.context({
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

  if (watch) {
    await ctx.watch();
    console.log('[esbuild] watching for changes… (press Ctrl+C to stop)');
    return;
  }

  await ctx.rebuild();
  await ctx.dispose();
  console.log('[esbuild] build complete.');
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
