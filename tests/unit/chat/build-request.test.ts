/**
 * Unit tests for buildChatRequest() — message assembly, file loading, zod validation.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChatRequest } from '../../../src/lib/chat/build-request.ts';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string | null = null;

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'or-test-'));
  return tempDir;
}

function writeTempJson(dir: string, name: string, data: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
}

afterEach(() => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    tempDir = null;
  }
});

// ---------------------------------------------------------------------------
// Message assembly
// ---------------------------------------------------------------------------

describe('buildChatRequest — message assembly', () => {
  test('user-only message: produces single user entry', async () => {
    const { body } = await buildChatRequest({ message: 'Hello', model: 'gpt-4o' });
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  test('system + user message: system comes first', async () => {
    const { body } = await buildChatRequest({
      message: 'Hello',
      model: 'gpt-4o',
      system: 'You are helpful.',
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  test('model field is set correctly', async () => {
    const { body } = await buildChatRequest({ message: 'Hi', model: 'anthropic/claude-3-opus' });
    expect(body.model).toBe('anthropic/claude-3-opus');
  });

  test('stream flag forwarded', async () => {
    const { body } = await buildChatRequest({ message: 'Hi', model: 'm', stream: true });
    expect(body.stream).toBe(true);
  });

  test('optional params mapped to snake_case', async () => {
    const { body } = await buildChatRequest({
      message: 'Hi',
      model: 'm',
      temperature: 0.7,
      maxTokens: 256,
      topP: 0.9,
      frequencyPenalty: 0.1,
      presencePenalty: 0.2,
      stop: ['END', 'STOP'],
    });
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(256);
    expect(body.top_p).toBe(0.9);
    expect(body.frequency_penalty).toBe(0.1);
    expect(body.presence_penalty).toBe(0.2);
    expect(body.stop).toEqual(['END', 'STOP']);
  });

  test('undefined optional params are omitted from body', async () => {
    const { body } = await buildChatRequest({ message: 'Hi', model: 'm' });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('stream');
  });
});

// ---------------------------------------------------------------------------
// File loading — tools
// ---------------------------------------------------------------------------

describe('buildChatRequest — tools file loading', () => {
  test('valid tools array is loaded and attached', async () => {
    const dir = makeTempDir();
    const toolsData = [
      {
        type: 'function',
        function: { name: 'get_weather', description: 'Get weather', parameters: {} },
      },
    ];
    const toolsPath = writeTempJson(dir, 'tools.json', toolsData);

    const { body } = await buildChatRequest({ message: 'Hi', model: 'm', tools: toolsPath });
    expect(Array.isArray(body.tools)).toBe(true);
    expect((body.tools as unknown[]).length).toBe(1);
  });

  test('malformed tool (missing type) throws CliError', async () => {
    const dir = makeTempDir();
    const bad = [{ notAValidTool: true }];
    const p = writeTempJson(dir, 'bad-tools.json', bad);

    await expect(buildChatRequest({ message: 'Hi', model: 'm', tools: p })).rejects.toBeInstanceOf(
      CliError,
    );
  });

  test('tools file that is not an array throws CliError', async () => {
    const dir = makeTempDir();
    const p = writeTempJson(dir, 'tools.json', { notAnArray: true });

    await expect(buildChatRequest({ message: 'Hi', model: 'm', tools: p })).rejects.toBeInstanceOf(
      CliError,
    );
  });

  test('missing tools file throws CliError', async () => {
    await expect(
      buildChatRequest({ message: 'Hi', model: 'm', tools: '/tmp/nonexistent-tools-file.json' }),
    ).rejects.toBeInstanceOf(CliError);
  });
});

// ---------------------------------------------------------------------------
// File loading — responseFormat
// ---------------------------------------------------------------------------

describe('buildChatRequest — response-format file loading', () => {
  test('valid response_format object is attached', async () => {
    const dir = makeTempDir();
    const rf = { type: 'json_object' };
    const p = writeTempJson(dir, 'rf.json', rf);

    const { body } = await buildChatRequest({ message: 'Hi', model: 'm', responseFormat: p });
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  test('response_format that is an array throws CliError', async () => {
    const dir = makeTempDir();
    const p = writeTempJson(dir, 'rf.json', [{ type: 'json_object' }]);

    await expect(
      buildChatRequest({ message: 'Hi', model: 'm', responseFormat: p }),
    ).rejects.toBeInstanceOf(CliError);
  });
});

// ---------------------------------------------------------------------------
// File loading — provider
// ---------------------------------------------------------------------------

describe('buildChatRequest — provider file loading', () => {
  test('valid provider object is attached', async () => {
    const dir = makeTempDir();
    const prov = { order: ['openai', 'anthropic'] };
    const p = writeTempJson(dir, 'provider.json', prov);

    const { body } = await buildChatRequest({ message: 'Hi', model: 'm', provider: p });
    expect(body.provider).toEqual({ order: ['openai', 'anthropic'] });
  });
});

// ---------------------------------------------------------------------------
// File loading — plugins
// ---------------------------------------------------------------------------

describe('buildChatRequest — plugins file loading', () => {
  test('valid plugins array is attached', async () => {
    const dir = makeTempDir();
    const plugins = [{ id: 'web', enabled: true }];
    const p = writeTempJson(dir, 'plugins.json', plugins);

    const { body } = await buildChatRequest({ message: 'Hi', model: 'm', plugins: p });
    expect(Array.isArray(body.plugins)).toBe(true);
  });

  test('plugins that is not an array throws CliError', async () => {
    const dir = makeTempDir();
    const p = writeTempJson(dir, 'plugins.json', { plugin: 'web' });

    await expect(
      buildChatRequest({ message: 'Hi', model: 'm', plugins: p }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
