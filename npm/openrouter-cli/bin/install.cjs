#!/usr/bin/env node
/**
 * Postinstall script: downloads the platform-specific openrouter binary
 * from the matching GitHub Release and places it at bin/openrouter-bin[.exe].
 *
 * Skips download in CI environments where binary isn't needed (e.g. lint-only installs)
 * unless OPENROUTER_FORCE_INSTALL=1.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { pipeline } = require('node:stream/promises');

const pkg = require('../package.json');
const version = pkg.version;

const REPO = 'mrgoonie/openrouter-cli';

function detectTarget() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'openrouter-darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'openrouter-darwin-x64';
  if (platform === 'linux' && arch === 'arm64') return 'openrouter-linux-arm64';
  if (platform === 'linux' && arch === 'x64') return 'openrouter-linux-x64';
  if (platform === 'win32' && arch === 'x64') return 'openrouter-windows-x64.exe';

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'openrouter-cli-installer' } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          return resolve(download(res.headers.location, dest, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const file = fs.createWriteStream(dest);
        pipeline(res, file).then(resolve).catch(reject);
      })
      .on('error', reject);
  });
}

async function main() {
  const binDir = path.join(__dirname);
  const target = detectTarget();
  const isWindows = target.endsWith('.exe');
  const outName = isWindows ? 'openrouter-bin.exe' : 'openrouter-bin';
  const outPath = path.join(binDir, outName);

  const url = `https://github.com/${REPO}/releases/download/v${version}/${target}`;
  console.log(`[openrouter-cli] Downloading ${target} v${version}...`);

  try {
    await download(url, outPath);
    fs.chmodSync(outPath, 0o755);
    console.log(`[openrouter-cli] Installed to ${outPath}`);
  } catch (err) {
    console.error(`[openrouter-cli] Install failed: ${err.message}`);
    console.error(`[openrouter-cli] URL: ${url}`);
    console.error('[openrouter-cli] You can run the CLI manually by downloading from GitHub Releases.');
    process.exit(1);
  }
}

// Skip if explicitly opted out
if (process.env.OPENROUTER_SKIP_INSTALL === '1') {
  console.log('[openrouter-cli] Skipping binary download (OPENROUTER_SKIP_INSTALL=1)');
  process.exit(0);
}

main();
