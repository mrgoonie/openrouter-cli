/**
 * Unit tests for buildCreateRequest — base64 frame-image encoding and body mapping.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import { buildCreateRequest } from '../../../src/lib/video/build-create-request.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpFiles: string[] = [];

async function writeTmp(name: string, size: number): Promise<string> {
  const path = join(tmpdir(), name);
  // Write `size` bytes of zeroes
  await Bun.write(path, new Uint8Array(size));
  tmpFiles.push(path);
  return path;
}

afterEach(async () => {
  for (const p of tmpFiles.splice(0)) {
    await unlink(p).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// camelCase → snake_case mapping
// ---------------------------------------------------------------------------

describe('buildCreateRequest — field mapping', () => {
  test('maps camelCase args to snake_case body keys', async () => {
    const body = (await buildCreateRequest({
      prompt: 'a cat',
      model: 'test-model',
      aspectRatio: '16:9',
      generateAudio: true,
    })) as Record<string, unknown>;

    expect(body.prompt).toBe('a cat');
    expect(body.model).toBe('test-model');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.generate_audio).toBe(true);
    // camelCase keys must not be present
    expect(body.aspectRatio).toBeUndefined();
    expect(body.generateAudio).toBeUndefined();
  });

  test('omits undefined optional fields', async () => {
    const body = (await buildCreateRequest({
      prompt: 'sky',
      model: 'x',
    })) as Record<string, unknown>;

    expect(body.aspect_ratio).toBeUndefined();
    expect(body.generate_audio).toBeUndefined();
    expect(body.duration).toBeUndefined();
    expect(body.resolution).toBeUndefined();
    expect(body.size).toBeUndefined();
    expect(body.frame_images).toBeUndefined();
  });

  test('includes duration, resolution, size when provided', async () => {
    const body = (await buildCreateRequest({
      prompt: 'ocean',
      model: 'y',
      duration: 5,
      resolution: '1080p',
      size: '1280x720',
    })) as Record<string, unknown>;

    expect(body.duration).toBe(5);
    expect(body.resolution).toBe('1080p');
    expect(body.size).toBe('1280x720');
  });
});

// ---------------------------------------------------------------------------
// Frame image encoding
// ---------------------------------------------------------------------------

describe('buildCreateRequest — frame-image encoding', () => {
  test('encodes a small PNG as a base64 data: URL', async () => {
    // 1 KB file — well under 2 MB limit
    const path = await writeTmp('frame-small.png', 1024);

    const body = (await buildCreateRequest({
      prompt: 'test',
      model: 'm',
      frameImages: [path],
    })) as Record<string, unknown>;

    const frameImages = body.frame_images as string[];
    expect(Array.isArray(frameImages)).toBe(true);
    expect(frameImages).toHaveLength(1);
    expect(frameImages[0]).toMatch(/^data:image\/png;base64,/);

    // Verify the base64 payload is non-empty
    const b64Part = frameImages[0]!.split(',')[1] ?? '';
    expect(b64Part.length).toBeGreaterThan(0);
  });

  test('encodes JPEG extension as image/jpeg MIME type', async () => {
    const path = await writeTmp('frame.jpg', 512);

    const body = (await buildCreateRequest({
      prompt: 'test',
      model: 'm',
      frameImages: [path],
    })) as Record<string, unknown>;

    const frameImages = body.frame_images as string[];
    expect(frameImages[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('encodes multiple frame images in order', async () => {
    const p1 = await writeTmp('f1.png', 256);
    const p2 = await writeTmp('f2.webp', 512);

    const body = (await buildCreateRequest({
      prompt: 'test',
      model: 'm',
      frameImages: [p1, p2],
    })) as Record<string, unknown>;

    const frameImages = body.frame_images as string[];
    expect(frameImages).toHaveLength(2);
    expect(frameImages[0]).toMatch(/^data:image\/png;base64,/);
    expect(frameImages[1]).toMatch(/^data:image\/webp;base64,/);
  });

  test('throws CliError for frame image ≥2MB', async () => {
    // 2 MB exactly — should be refused
    const path = await writeTmp('frame-large.png', 2 * 1024 * 1024);

    await expect(
      buildCreateRequest({
        prompt: 'test',
        model: 'm',
        frameImages: [path],
      }),
    ).rejects.toThrow(CliError);
  });

  test('CliError for large frame image has usage code and hint about v1 limitation', async () => {
    const path = await writeTmp('frame-huge.png', 2 * 1024 * 1024 + 1);

    let caught: unknown;
    try {
      await buildCreateRequest({ prompt: 'x', model: 'm', frameImages: [path] });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CliError);
    const err = caught as CliError;
    expect(err.code).toBe('usage');
    expect(err.message).toContain('2MB');
    expect(err.hint).toContain('TODO');
  });
});
