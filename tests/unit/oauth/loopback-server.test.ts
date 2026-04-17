import { afterEach, describe, expect, test } from 'bun:test';
import { startLoopback } from '../../../src/lib/oauth/loopback-server.ts';
import type { LoopbackServer } from '../../../src/lib/oauth/loopback-server.ts';

describe('startLoopback', () => {
  let server: LoopbackServer | null = null;

  afterEach(() => {
    try {
      server?.stop();
    } catch {
      /* ignore */
    }
    server = null;
  });

  test('starts and returns a port number', async () => {
    server = await startLoopback();
    expect(server.port).toBeGreaterThan(0);
    expect(server.port).toBeLessThanOrEqual(65535);
  });

  test('binds to the preferred port when available', async () => {
    // Use a high ephemeral port unlikely to be in use
    const preferred = 19876;
    server = await startLoopback({ preferredPort: preferred });
    expect(server.port).toBe(preferred);
  });

  test('waitForCode resolves when callback URL contains code param', async () => {
    server = await startLoopback();
    const { port, waitForCode } = server;

    // Hit the loopback server with a code in the query string
    const codePromise = waitForCode(5_000);
    const res = await fetch(`http://localhost:${port}/?code=testcode123`);

    expect(res.status).toBe(200);
    const receivedCode = await codePromise;
    expect(receivedCode).toBe('testcode123');
  });

  test('response contains HTML with success message', async () => {
    server = await startLoopback();
    const res = await fetch(`http://localhost:${server.port}/?code=anycode`);
    const html = await res.text();
    expect(html).toContain('close this window');
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  test('waitForCode rejects with CliError on timeout', async () => {
    server = await startLoopback();
    await expect(server.waitForCode(50)).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  test('stop() does not throw', async () => {
    server = await startLoopback();
    expect(() => server!.stop()).not.toThrow();
    server = null; // already stopped
  });

  test('two servers can run on different ports simultaneously', async () => {
    const s1 = await startLoopback();
    const s2 = await startLoopback();
    try {
      expect(s1.port).not.toBe(s2.port);
      expect(s1.port).toBeGreaterThan(0);
      expect(s2.port).toBeGreaterThan(0);
    } finally {
      s1.stop();
      s2.stop();
    }
  });
});
