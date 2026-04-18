#!/usr/bin/env node
/**
 * Launcher: spawns the downloaded native binary with forwarded args + stdio.
 * The binary is installed by bin/install.cjs via the postinstall step.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isWindows = process.platform === 'win32';
const binName = isWindows ? 'openrouter-bin.exe' : 'openrouter-bin';
const binPath = path.join(__dirname, binName);

if (!fs.existsSync(binPath)) {
  console.error(`[openrouter-cli] Binary not found at ${binPath}`);
  console.error('[openrouter-cli] Try reinstalling: npm install -g @mrgoonie/openrouter-cli');
  process.exit(1);
}

const child = spawn(binPath, process.argv.slice(2), { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`[openrouter-cli] Failed to launch binary: ${err.message}`);
  process.exit(1);
});
