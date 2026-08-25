/**
 * @file Electron 构建脚本
 * @description 构建前端 + 服务端，然后使用 electron-builder 打包桌面应用
 *
 * 用法:
 *   node scripts/electron-build.js                  # 当前平台
 *   node scripts/electron-build.js --platform=win   # Windows
 *   node scripts/electron-build.js --platform=mac   # macOS
 *   node scripts/electron-build.js --platform=linux # Linux
 *   node scripts/electron-build.js --platform=all   # 所有平台
 */

const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

// Use Chinese mirror for local builds (outside CI). GitHub Actions runners can access GitHub directly.
if (!process.env.CI) {
  if (!process.env.ELECTRON_MIRROR) {
    process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
  }
  if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';
  }
}

const args = process.argv.slice(2);
const targetPlatform = args.find(arg => arg.startsWith('--platform='))?.split('=')[1];

function getCurrentPlatform() {
  switch (process.platform) {
    case 'darwin': return 'mac';
    case 'win32': return 'win';
    default: return 'linux';
  }
}

async function build() {
  try {
    console.log('Building AICmd Electron app...\n');

    // 全局：macOS 的 C++ 标准库头文件路径（SDK 内）。Electron/Node 原生模块编译
    // 时需要 <memory> 等 libc++ 头，否则报 'memory' file not found。注入到进程级
    // CXXFLAGS，electron-builder 内置 npmRebuild 与显式 @electron/rebuild 都会继承。
    if (process.platform === 'darwin') {
      try {
        const sdkPath = execSync('xcrun --show-sdk-path', { encoding: 'utf-8' }).trim();
        process.env.CXXFLAGS = (process.env.CXXFLAGS || '') + ` -stdlib=libc++ -isystem ${sdkPath}/usr/include/c++/v1`;
        console.log(`macOS SDK C++ include: ${sdkPath}/usr/include/c++/v1`);
      } catch (e) { /* ignore */ }
    }

    // 1. 构建前端 + 服务端
    console.log('1. Building Vue app + server...');
    execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });

    // 2. 重编原生模块以匹配 Electron ABI
    //    注意：不要手动调 `node-gyp install` —— 它会去 nodejs.org 拉 Electron 头文件，必 404。
    //    使用 @electron/rebuild（electron-builder 的依赖），它会自动用 electronjs.org/headers 源。
    //    仅重编必需模块 node-pty；cpu-features 为可选依赖，仅做 CPU 探测，编译失败不影响运行，故跳过。
    console.log('\n2. Rebuilding native modules for Electron...');
    try {
      const env = { ...process.env };
      // 让 @electron/rebuild 使用官方 headers 镜像（避免 nodejs.org 404）
      env.npm_config_disturl = 'https://electronjs.org/headers';
      env.ELECTRON_BUILDER_BINARIES_MIRROR = env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://electronjs.org/headers';

      const electronVersion = require('electron/package.json').version;
      const rebuildCmd = `npx --yes @electron/rebuild -f -e ${electronVersion} -m ${projectRoot} -w node-pty`;
      execSync(rebuildCmd, { stdio: 'inherit', cwd: projectRoot, env });
      console.log('  ✓ native modules rebuilt');
    } catch (e) {
      console.warn('Native module rebuild failed (non-fatal):', e.message);
    }

    // 3. 使用 electron-builder 打包
    console.log('\n3. Packaging with electron-builder...');

    const builder = require('electron-builder');
    const platform = targetPlatform || getCurrentPlatform();

    const platformMap = {
      mac: builder.Platform.MAC.createTarget(),
      win: builder.Platform.WINDOWS.createTarget(),
      linux: builder.Platform.LINUX.createTarget(),
    };

    let targets;
    if (platform === 'all') {
      targets = {
        ...platformMap.mac,
        ...platformMap.win,
        ...platformMap.linux,
      };
    } else if (platformMap[platform]) {
      targets = platformMap[platform];
    } else {
      console.error(`Unsupported platform: ${platform}`);
      console.error('Supported: mac, win, linux, all');
      process.exit(1);
    }

    // 配置合并：CI 无 Apple 证书，使用 ad-hoc 签名（"-"），避免完全未签名
    // 导致 Gatekeeper 直接报"已损坏"。本地（非 CI）保留 null，由 electron-builder
    // 自动从 keychain 发现 Developer ID 证书做正式签名。
    const baseConfig = require(path.resolve(projectRoot, 'electron-builder.json'));
    if (process.env.CI) {
      baseConfig.mac = baseConfig.mac || {};
      baseConfig.mac.identity = '-'; // ad-hoc 签名
    }

    await builder.build({
      targets,
      config: {
        ...baseConfig,
        // 原生模块统一由上方显式 @electron/rebuild 重编（仅 node-pty），此处关闭内置
        // npmRebuild，避免它再编译 cpu-features 等非必需模块导致失败/headers 404。
        npmRebuild: false,
      },
      projectDir: projectRoot,
      publish: 'never',
    });

    console.log('\n🎉 Build complete! Check the release/ directory.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
