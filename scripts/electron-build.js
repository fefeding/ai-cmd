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

const { resolve } = require('path');
const { execSync } = require('child_process');

const projectRoot = resolve(__dirname, '..');

// Use Chinese mirror for Electron downloads if not already set
if (!process.env.ELECTRON_MIRROR) {
  process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
}
if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';
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

    // 1. 构建前端 + 服务端
    console.log('1. Building Vue app + server...');
    execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });

    // 2. Pre-rebuild only node-pty for Electron (cpu-features is optional and may fail without VS Build Tools)
    console.log('\n2. Rebuilding node-pty for Electron...');
    try {
      // Use node to find and run @electron/rebuild
      const { execSync: exec } = require('child_process');
      // Try npx first, fallback to direct path
      try {
        exec('npx --yes @electron/rebuild -m . -w node-pty', { stdio: 'inherit', cwd: projectRoot });
      } catch {
        // Try pnpm exec
        try {
          exec('pnpm exec electron-rebuild -m . -w node-pty', { stdio: 'inherit', cwd: projectRoot });
        } catch {
          console.warn('Warning: @electron/rebuild not available. node-pty may need manual rebuild for Electron.');
          console.warn('Install build tools and run: npx @electron/rebuild -m . -w node-pty');
        }
      }
    } catch (e) {
      console.warn('Warning: node-pty rebuild failed, continuing anyway...');
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

    await builder.build({
      targets,
      config: resolve(projectRoot, 'electron-builder.json'),
      projectDir: projectRoot,
    });

    console.log('\n🎉 Build complete! Check the release/ directory.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
