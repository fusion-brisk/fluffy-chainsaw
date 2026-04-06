/**
 * Setup mode for relay binary.
 *
 * When the user downloads the relay binary and runs it directly,
 * this module handles first-time installation:
 *
 * 1. Kill any existing relay process on port 3847
 * 2. Copy self to ~/.contentify/relay-host
 * 3. Re-sign binary (macOS requirement)
 * 4. Create/update LaunchAgent plist for auto-start
 * 5. Start relay via launchctl
 * 6. Exit (LaunchAgent keeps relay running in background)
 *
 * Usage: ./contentify-relay-host-arm64 --setup
 * Also triggered when binary detects it's NOT running from ~/.contentify/
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const INSTALL_DIR = path.join(process.env.HOME || '/tmp', '.contentify');
const BINARY_PATH = path.join(INSTALL_DIR, 'relay-host');
const HOST_NAME = 'com.contentify.relay';
const PORT = 3847;

function log(msg: string): void {
  console.log(msg);
}

/** Run a command, ignoring errors */
function run(cmd: string, args: string[], timeout = 5000): string {
  try {
    return execFileSync(cmd, args, { timeout, stdio: 'pipe' }).toString().trim();
  } catch {
    return '';
  }
}

function killExistingRelay(): void {
  log('⏹  Stopping existing relay...');

  // Try launchctl first
  run('launchctl', ['stop', HOST_NAME]);

  // Kill any process on the port
  const lsofOutput = run('lsof', ['-ti', `:${PORT}`]);
  if (lsofOutput) {
    for (const pid of lsofOutput.split('\n')) {
      run('kill', ['-9', pid.trim()], 3000);
    }
    log('   ✓ Old process killed');
  }
}

function copyBinary(): void {
  log('📦 Installing relay...');
  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  const selfPath = process.execPath;

  // Skip copy if already running from the install location
  if (path.resolve(selfPath) === path.resolve(BINARY_PATH)) {
    log('   ✓ Already installed');
    return;
  }

  // Remove old binary
  try {
    fs.unlinkSync(BINARY_PATH);
  } catch {
    /* doesn't exist */
  }

  // Copy self to install location
  fs.copyFileSync(selfPath, BINARY_PATH);
  fs.chmodSync(BINARY_PATH, 0o755);

  // Re-sign — macOS kills binaries with invalid code signatures after copy
  const signResult = run('codesign', ['--force', '--sign', '-', BINARY_PATH], 10000);
  if (signResult !== '') {
    log('   ✓ Binary installed and signed');
  } else {
    log('   ✓ Binary installed');
  }
}

function setupLaunchAgent(): void {
  log('🔄 Setting up auto-start...');

  const launchAgentsDir = path.join(process.env.HOME || '/tmp', 'Library', 'LaunchAgents');
  fs.mkdirSync(launchAgentsDir, { recursive: true });
  const plistPath = path.join(launchAgentsDir, `${HOST_NAME}.plist`);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${HOST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BINARY_PATH}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/contentify-relay.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/contentify-relay.err</string>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plist);

  // Unload then load
  run('launchctl', ['unload', plistPath]);
  run('launchctl', ['load', plistPath]);

  log('   ✓ LaunchAgent configured');
}

function startRelay(): void {
  log('🚀 Starting relay...');

  run('launchctl', ['start', HOST_NAME]);

  // Wait for relay to start (synchronous)
  run('sleep', ['1'], 3000);

  const check = run('lsof', ['-i', `:${PORT}`], 3000);
  if (check) {
    log(`   ✓ Relay running on port ${PORT}`);
  } else {
    log('   ⚠ Relay will start on next login');
  }

  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('✅ Contentify Relay installed!');
  log(`   Running at http://localhost:${PORT}`);
  log('   Auto-starts on login.');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');
}

export function runSetup(): void {
  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('  Contentify Relay — Setup');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');

  killExistingRelay();
  copyBinary();
  setupLaunchAgent();
  startRelay();
}
