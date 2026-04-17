import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findRoots, loadDotenvCascade } from '../../../src/lib/config/dotenv-cascade.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'or-dotenv-test-'));
}

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Test fixture roots
// ---------------------------------------------------------------------------

let root: string;

beforeAll(() => {
  root = tmpDir();
});

afterAll(() => {
  rmrf(root);
});

// ---------------------------------------------------------------------------
// findRoots
// ---------------------------------------------------------------------------

describe('findRoots', () => {
  test('returns at least the cwd itself', () => {
    const dirs = findRoots(root);
    expect(dirs).toContain(root);
  });

  test('stops walk at .git directory marker', () => {
    const base = path.join(root, 'git-stop-test');
    const gitRoot = path.join(base, 'repo');
    const child = path.join(gitRoot, 'packages', 'app');

    fs.mkdirSync(child, { recursive: true });
    fs.mkdirSync(path.join(gitRoot, '.git'), { recursive: true });

    const dirs = findRoots(child);

    // Should include child, packages, gitRoot but NOT base (parent of .git marker dir)
    expect(dirs).toContain(gitRoot);
    expect(dirs).not.toContain(base);
  });

  test('stops walk at .git file marker (git worktree)', () => {
    const base = path.join(root, 'git-file-stop');
    const gitRoot = path.join(base, 'worktree');
    const child = path.join(gitRoot, 'src');

    fs.mkdirSync(child, { recursive: true });
    // .git as a file (worktree link)
    fs.writeFileSync(path.join(gitRoot, '.git'), 'gitdir: ../.git/worktrees/app\n');

    const dirs = findRoots(child);
    expect(dirs).toContain(gitRoot);
    expect(dirs).not.toContain(base);
  });

  test('dirs are ordered outside → inside (parent before child)', () => {
    const parent = path.join(root, 'order-test');
    const child = path.join(parent, 'child');
    fs.mkdirSync(child, { recursive: true });
    // Place .git at parent to cap the walk
    fs.mkdirSync(path.join(parent, '.git'), { recursive: true });

    const dirs = findRoots(child);
    const parentIdx = dirs.indexOf(parent);
    const childIdx = dirs.indexOf(child);
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(childIdx).toBeGreaterThan(parentIdx);
  });
});

// ---------------------------------------------------------------------------
// loadDotenvCascade
// ---------------------------------------------------------------------------

describe('loadDotenvCascade', () => {
  test('loads basic .env file', () => {
    const dir = path.join(root, 'basic');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    write(path.join(dir, '.env'), 'BASIC_KEY=hello\n');

    const map = loadDotenvCascade(dir, 'development');
    expect(map.BASIC_KEY?.value).toBe('hello');
    expect(map.BASIC_KEY?.path).toContain('.env');
  });

  test('.env.<mode>.local overrides .env', () => {
    const dir = path.join(root, 'priority');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    write(path.join(dir, '.env'), 'PRIO_KEY=base\n');
    write(path.join(dir, '.env.development'), 'PRIO_KEY=mode\n');
    write(path.join(dir, '.env.local'), 'PRIO_KEY=local\n');
    write(path.join(dir, '.env.development.local'), 'PRIO_KEY=mode-local\n');

    const map = loadDotenvCascade(dir, 'development');
    expect(map.PRIO_KEY?.value).toBe('mode-local');
  });

  test('.env.local overrides .env.<mode>', () => {
    const dir = path.join(root, 'local-vs-mode');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    write(path.join(dir, '.env'), 'LVM_KEY=base\n');
    write(path.join(dir, '.env.development'), 'LVM_KEY=mode\n');
    write(path.join(dir, '.env.local'), 'LVM_KEY=local\n');
    // no .env.development.local

    const map = loadDotenvCascade(dir, 'development');
    expect(map.LVM_KEY?.value).toBe('local');
  });

  test('.env.<mode> overrides .env', () => {
    const dir = path.join(root, 'mode-vs-base');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    write(path.join(dir, '.env'), 'MVB_KEY=base\n');
    write(path.join(dir, '.env.production'), 'MVB_KEY=prod\n');

    const map = loadDotenvCascade(dir, 'production');
    expect(map.MVB_KEY?.value).toBe('prod');
  });

  test('closer directory overrides outer directory', () => {
    const outer = path.join(root, 'closer-outer');
    const inner = path.join(outer, 'inner');
    fs.mkdirSync(path.join(outer, '.git'), { recursive: true });
    fs.mkdirSync(inner, { recursive: true });

    write(path.join(outer, '.env'), 'CLOSER_KEY=outer\n');
    write(path.join(inner, '.env'), 'CLOSER_KEY=inner\n');

    const map = loadDotenvCascade(inner, 'development');
    expect(map.CLOSER_KEY?.value).toBe('inner');
    expect(map.CLOSER_KEY?.path).toContain('inner');
  });

  test('upward walk collects files from parent directories', () => {
    const outer = path.join(root, 'upward');
    const inner = path.join(outer, 'sub');
    fs.mkdirSync(path.join(outer, '.git'), { recursive: true });
    fs.mkdirSync(inner, { recursive: true });

    write(path.join(outer, '.env'), 'OUTER_ONLY=yes\n');
    // inner has no .env for OUTER_ONLY

    const map = loadDotenvCascade(inner, 'development');
    expect(map.OUTER_ONLY?.value).toBe('yes');
  });

  test('${VAR} references are expanded using already-loaded keys', () => {
    const dir = path.join(root, 'expand');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    write(path.join(dir, '.env'), 'BASE_URL=https://example.com\nFULL_URL=${BASE_URL}/api\n');

    const map = loadDotenvCascade(dir, 'development');
    expect(map.FULL_URL?.value).toBe('https://example.com/api');
  });

  test('process.env keys are never overwritten by dotenv files', () => {
    const dir = path.join(root, 'env-wins');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    write(path.join(dir, '.env'), 'ENV_WINS_KEY=from-file\n');

    const prev = process.env.ENV_WINS_KEY;
    process.env.ENV_WINS_KEY = 'from-process';
    try {
      const map = loadDotenvCascade(dir, 'development');
      // Key should NOT appear in dotenvMap because process.env wins
      expect(map.ENV_WINS_KEY).toBeUndefined();
    } finally {
      if (prev !== undefined) {
        process.env.ENV_WINS_KEY = prev;
      } else {
        process.env.ENV_WINS_KEY = undefined;
      }
    }
  });

  test('missing dotenv files are silently skipped', () => {
    const dir = path.join(root, 'empty');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    // no .env files at all

    expect(() => loadDotenvCascade(dir, 'development')).not.toThrow();
    const map = loadDotenvCascade(dir, 'development');
    expect(Object.keys(map)).toHaveLength(0);
  });
});
