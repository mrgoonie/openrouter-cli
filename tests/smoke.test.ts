import { describe, expect, it } from 'bun:test';
import { VERSION } from '../src/version.ts';

describe('scaffold smoke', () => {
  it('exposes a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});
