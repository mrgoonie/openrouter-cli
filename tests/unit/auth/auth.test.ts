import { describe, expect, test } from 'bun:test';
import authCommand from '../../../src/commands/auth.ts';
import { maskKey } from '../../../src/lib/auth/mask-key.ts';

describe('auth subcommand routing', () => {
  test('authCommand has exactly 5 subcommands', () => {
    const subs = authCommand.subCommands;
    expect(subs).toBeDefined();
    expect(Object.keys(subs ?? {})).toHaveLength(5);
  });

  test('all expected verbs are registered', () => {
    const subs = authCommand.subCommands ?? {};
    const keys = Object.keys(subs);
    expect(keys).toContain('login');
    expect(keys).toContain('logout');
    expect(keys).toContain('status');
    expect(keys).toContain('whoami');
    expect(keys).toContain('set-key');
  });

  test('each subcommand is a defined command object', () => {
    const subs = authCommand.subCommands ?? {};
    for (const [name, cmd] of Object.entries(subs)) {
      expect(cmd, `${name} should be defined`).toBeDefined();
      // citty commands expose a run function or subCommands
      expect(typeof cmd === 'object' && cmd !== null, `${name} should be an object`).toBe(true);
    }
  });
});

describe('maskKey applied in status-style rendering', () => {
  test('api_key value is masked when present', () => {
    const key = 'sk-or-v1-abcdefghijklmnop1234';
    const masked = maskKey(key);
    // Should not expose the full key
    expect(masked).not.toBe(key);
    expect(masked).toContain('…');
    expect(masked.slice(0, 10)).toBe(key.slice(0, 10));
    expect(masked.slice(-4)).toBe(key.slice(-4));
  });

  test('unset key displays as (unset), not masked', () => {
    // Simulate what status command does: only mask if value exists
    const value: string | undefined = undefined;
    const display = value ? maskKey(value) : '(unset)';
    expect(display).toBe('(unset)');
  });

  test('non-key fields (base_url, timeout) are not masked', () => {
    // Verify the status command logic: only mask if field name contains 'key'
    const fields = [
      { name: 'api_key', value: 'sk-or-v1-somekey12345678', shouldMask: true },
      { name: 'management_key', value: 'sk-or-v1-mgmtkey123456', shouldMask: true },
      { name: 'base_url', value: 'https://openrouter.ai/api/v1', shouldMask: false },
      { name: 'timeout', value: '60000', shouldMask: false },
      { name: 'output', value: 'pretty', shouldMask: false },
    ];

    for (const field of fields) {
      const display = field.name.includes('key') ? maskKey(field.value) : field.value;
      if (field.shouldMask) {
        expect(display).toContain('…');
        expect(display).not.toBe(field.value);
      } else {
        expect(display).toBe(field.value);
      }
    }
  });
});
