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

    // 1. 构建前端 + 服务端
    console.log('1. Building Vue app + server...');
    execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });

    // 2. Rebuild native modules for Electron
    console.log('\n2. Rebuilding native modules for Electron...');
    try {
      // macOS 26+ 的 C++ 头文件在 SDK 内部，需要额外 -isystem 路径
      const env = { ...process.env };
      if (process.platform === 'darwin') {
        try {
          const sdkPath = execSync('xcrun --show-sdk-path', { encoding: 'utf-8' }).trim();
          env.CXXFLAGS = (env.CXXFLAGS || '') + ` -isystem ${sdkPath}/usr/include/c++/v1`;
          console.log(`macOS SDK: ${sdkPath}`);
        } catch (e) { /* ignore */ }
      }

      const electronVersion = require('electron/package.json').version;
      const nodedir = path.join(require('os').homedir(), '.electron-gyp', electronVersion);
      const arch = process.arch;
      const gypArgs = `--target=${electronVersion} --arch=${arch} --nodedir=${nodedir}`;

      // 确保 Electron headers 已下载
      try {
        require('fs').accessSync(nodedir);
      } catch {
        console.log('Downloading Electron headers...');
        execSync(`npx node-gyp install ${gypArgs}`, { stdio: 'inherit', cwd: projectRoot, env });
      }

      // 逐个编译原生模块（先 configure 修复 deployment target，再 build）
      const nativeModules = ['node-pty', 'cpu-features'];
      for (const mod of nativeModules) {
        let modDir;
        try {
          modDir = execSync(`node -p "require.resolve('${mod}/package.json').replace('/package.json','')"`, { encoding: 'utf-8', cwd: projectRoot }).trim();
        } catch (e) {
          console.warn(`  ⚠ Cannot resolve ${mod}, skipping`);
          continue;
        }
        console.log(`Building ${mod} at ${modDir}...`);
        try {
          execSync(`npx node-gyp configure ${gypArgs}`, { stdio: 'inherit', cwd: modDir, env });
          // macOS: 修复过时的 deployment target (10.7 → 11.0)
          if (process.platform === 'darwin') {
            execSync(`find build -name "*.mk" -exec sed -i '' 's/-mmacosx-version-min=10\\.7/-mmacosx-version-min=11.0/g' {} +`, { cwd: modDir });
          }
          execSync(`make -C build`, { stdio: 'inherit', cwd: modDir, env });
          console.log(`  ✓ ${mod} built successfully`);
        } catch (e) {
          console.warn(`  ⚠ ${mod} build failed (non-fatal):`, e.message);
        }
      }
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

    await builder.build({
      targets,
      config: {
        ...require(path.resolve(projectRoot, 'electron-builder.json')),
        // In CI, enable native module rebuild (build tools available)
        npmRebuild: !!process.env.CI,
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
