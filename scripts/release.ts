#!/usr/bin/env bun
/**
 * Release script: uploads dist/* to GitHub Release, generates Homebrew formula,
 * and publishes the npm wrapper package.
 *
 * Prerequisites:
 *   - GITHUB_REF_NAME env var set to the tag (e.g. v0.1.0)
 *   - dist/ built via `bun run build:binaries`
 *   - gh CLI authenticated
 *   - NPM_TOKEN env var set for npm publish
 *
 * Usage: bun run scripts/release.ts
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function run(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: opts?.cwd,
    env: { ...process.env, ...(opts?.env ?? {}) },
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

function log(msg: string) {
  console.log(`[release] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[release] WARN: ${msg}`);
}

// ---------------------------------------------------------------------------
// Validate environment
// ---------------------------------------------------------------------------

const tag = process.env.GITHUB_REF_NAME;
if (!tag) {
  console.error(
    '[release] ERROR: GITHUB_REF_NAME is not set. Run via the release workflow or set it manually.',
  );
  process.exit(1);
}

const version = tag.replace(/^v/, '');
log(`Tag: ${tag}  Version: ${version}`);

// Verify dist/ exists and has binaries
if (!existsSync('dist')) {
  console.error('[release] ERROR: dist/ does not exist. Run `bun run build:binaries` first.');
  process.exit(1);
}

const distFiles = readdirSync('dist');
const binaries = distFiles.filter((f) => f.startsWith('openrouter-') || f.endsWith('.exe'));

if (binaries.length === 0) {
  console.error('[release] ERROR: No binaries found in dist/. Run `bun run build:binaries` first.');
  process.exit(1);
}

log(`Found ${binaries.length} binaries: ${binaries.join(', ')}`);

// ---------------------------------------------------------------------------
// Step 1: GitHub Release
// ---------------------------------------------------------------------------

const errors: string[] = [];

log('Creating GitHub Release...');
const distGlob = distFiles.map((f) => `dist/${f}`);
const ghRelease = await run([
  'gh',
  'release',
  'create',
  tag,
  ...distGlob,
  '--title',
  `openrouter ${tag}`,
  '--notes',
  'See CHANGELOG.md for details.',
]);

if (ghRelease.code !== 0) {
  errors.push(`GitHub Release failed: ${ghRelease.stderr}`);
  warn(`GitHub Release failed: ${ghRelease.stderr}`);
} else {
  log('GitHub Release created successfully.');
}

// ---------------------------------------------------------------------------
// Step 2: Homebrew formula
// ---------------------------------------------------------------------------

// Read checksums
const checksumsPath = 'dist/checksums.txt';
const checksumMap: Record<string, string> = {};

if (existsSync(checksumsPath)) {
  const lines = readFileSync(checksumsPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    // format: <hash>  <filename>
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      checksumMap[parts[1]] = parts[0];
    }
  }
  log(`Loaded ${Object.keys(checksumMap).length} checksums from dist/checksums.txt`);
} else {
  warn('dist/checksums.txt not found — Homebrew formula will have empty SHA fields.');
}

const tplPath = 'Formula/openrouter.rb.tpl';
if (existsSync(tplPath)) {
  const tpl = readFileSync(tplPath, 'utf8');
  const formula = tpl
    .replaceAll('#{VERSION}', version)
    .replaceAll('#{SHA256_DARWIN_ARM64}', checksumMap['openrouter-darwin-arm64'] ?? '')
    .replaceAll('#{SHA256_DARWIN_X64}', checksumMap['openrouter-darwin-x64'] ?? '')
    .replaceAll('#{SHA256_LINUX_ARM64}', checksumMap['openrouter-linux-arm64'] ?? '')
    .replaceAll('#{SHA256_LINUX_X64}', checksumMap['openrouter-linux-x64'] ?? '');

  await Bun.write('dist/openrouter.rb', formula);
  log('Homebrew formula written to dist/openrouter.rb');
  log('TODO: Open a PR on your homebrew-tap repo to update Formula/openrouter.rb');
  log('      Copy dist/openrouter.rb → Formula/openrouter.rb in your tap repo and submit a PR.');
  log('      Set HOMEBREW_TAP_TOKEN secret and implement auto-PR in a future release.');
} else {
  warn('Formula/openrouter.rb.tpl not found — skipping Homebrew step.');
}

// ---------------------------------------------------------------------------
// Step 3: npm publish
// ---------------------------------------------------------------------------

const npmToken = process.env.NPM_TOKEN;
if (!npmToken) {
  warn('NPM_TOKEN not set — skipping npm publish.');
} else {
  log('Publishing npm wrapper package...');
  const npmResult = await run(['npm', 'publish', '--access', 'public'], {
    cwd: 'npm/openrouter-cli',
    env: { NODE_AUTH_TOKEN: npmToken },
  });

  if (npmResult.code !== 0) {
    errors.push(`npm publish failed: ${npmResult.stderr}`);
    warn(`npm publish failed: ${npmResult.stderr}`);
  } else {
    log('npm package published successfully.');
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error('\n[release] Completed with errors:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

log('Release pipeline completed successfully.');
