#!/usr/bin/env bun
/**
 * Cross-compiles openrouter-cli for all 5 target platforms.
 * Produces dist/<name>[.exe] + dist/checksums.txt.
 * Usage: bun run scripts/build-binaries.ts
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface Target {
  target: string;
  outName: string;
}

const TARGETS: Target[] = [
  { target: 'bun-darwin-arm64', outName: 'openrouter-darwin-arm64' },
  { target: 'bun-darwin-x64', outName: 'openrouter-darwin-x64' },
  { target: 'bun-linux-arm64', outName: 'openrouter-linux-arm64' },
  { target: 'bun-linux-x64', outName: 'openrouter-linux-x64' },
  { target: 'bun-windows-x64', outName: 'openrouter-windows-x64.exe' },
];

// Read version from package.json
const pkgRaw = await Bun.file('package.json').text();
const pkg = JSON.parse(pkgRaw) as { version: string };
const version = pkg.version;

if (!existsSync('dist')) {
  mkdirSync('dist', { recursive: true });
}

console.log(`Building openrouter-cli v${version} for ${TARGETS.length} targets...\n`);

const failures: string[] = [];
const checksums: Array<{ hash: string; name: string }> = [];

for (const { target, outName } of TARGETS) {
  const outfile = join('dist', outName);
  console.log(`  Building ${outName} (${target})...`);

  const proc = Bun.spawn(
    [
      'bun',
      'build',
      'src/main.ts',
      '--compile',
      '--minify',
      '--target',
      target,
      '--define',
      `VERSION="${version}"`,
      '--outfile',
      outfile,
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`  FAILED (exit ${exitCode}): ${stderr.trim()}`);
    failures.push(outName);
    continue;
  }

  // Compute SHA-256
  const buf = await Bun.file(outfile).arrayBuffer();
  const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');

  // Log file size
  const sizeBytes = buf.byteLength;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
  console.log(`  OK  ${outName}  ${sizeMB} MB  sha256:${hash.slice(0, 16)}...`);

  checksums.push({ hash, name: outName });
}

// Write checksums.txt (standard sha256sum format: hash + two spaces + filename)
if (checksums.length > 0) {
  const lines = checksums.map(({ hash, name }) => `${hash}  ${name}`).join('\n');
  await Bun.write('dist/checksums.txt', `${lines}\n`);
  console.log(`\nWrote dist/checksums.txt (${checksums.length} entries)`);
}

if (failures.length > 0) {
  console.error(`\nFailed targets: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`\nAll ${TARGETS.length} targets built successfully.`);
