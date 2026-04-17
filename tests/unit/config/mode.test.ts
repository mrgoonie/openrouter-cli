import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { resolveMode } from '../../../src/lib/config/mode.ts';

describe('resolveMode', () => {
  let origOpenrouterEnv: string | undefined;
  let origNodeEnv: string | undefined;

  beforeEach(() => {
    origOpenrouterEnv = process.env.OPENROUTER_ENV;
    origNodeEnv = process.env.NODE_ENV;
    process.env.OPENROUTER_ENV = undefined;
    process.env.NODE_ENV = undefined;
  });

  afterEach(() => {
    if (origOpenrouterEnv !== undefined) {
      process.env.OPENROUTER_ENV = origOpenrouterEnv;
    } else {
      process.env.OPENROUTER_ENV = undefined;
    }
    if (origNodeEnv !== undefined) {
      process.env.NODE_ENV = origNodeEnv;
    } else {
      process.env.NODE_ENV = undefined;
    }
  });

  test('defaults to development when no env vars set', () => {
    expect(resolveMode()).toBe('development');
  });

  test('uses NODE_ENV when OPENROUTER_ENV is absent', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveMode()).toBe('production');
  });

  test('OPENROUTER_ENV wins over NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    process.env.OPENROUTER_ENV = 'staging';
    expect(resolveMode()).toBe('staging');
  });

  test('OPENROUTER_ENV alone works', () => {
    process.env.OPENROUTER_ENV = 'test';
    expect(resolveMode()).toBe('test');
  });
});
