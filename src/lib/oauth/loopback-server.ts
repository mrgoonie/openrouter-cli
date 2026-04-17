/**
 * Loopback HTTP server for OAuth PKCE callback.
 * Binds on 127.0.0.1, scanning ports 8976–8999 until one is free.
 * Resolves the authorization `code` from the callback query string.
 */

import { CliError } from '../errors/exit-codes.ts';

const PORT_START = 8976;
const PORT_END = 8999;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>OpenRouter — Authorized</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:4rem auto;text-align:center">
  <h1>You're logged in!</h1>
  <p>You can close this window and return to your terminal.</p>
</body>
</html>`;

export type LoopbackServer = {
  /** The port the server is listening on. */
  port: number;
  /**
   * Wait for the OAuth callback to deliver a `code`.
   * Rejects with CliError('timeout') if `timeoutMs` elapses first.
   */
  waitForCode(timeoutMs: number): Promise<string>;
  /** Tear down the server. Best-effort — does not throw. */
  stop(): void;
};

/**
 * Start a loopback HTTP server ready to receive the OAuth callback.
 * Scans ports 8976–8999 in order; falls back to random ephemeral if all busy.
 */
export async function startLoopback(
  opts: { preferredPort?: number } = {},
): Promise<LoopbackServer> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;

  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const fetchHandler = (req: Request): Response => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    if (code) {
      resolveCode(code);
      return new Response(SUCCESS_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Waiting for authorization code…', { status: 200 });
  };

  // Build port scan list: preferred port first (if provided), then 8976–8999
  const portsToTry: number[] = [];
  if (opts.preferredPort && opts.preferredPort >= 1 && opts.preferredPort <= 65535) {
    portsToTry.push(opts.preferredPort);
  }
  for (let p = PORT_START; p <= PORT_END; p++) {
    if (p !== opts.preferredPort) portsToTry.push(p);
  }

  let server: ReturnType<typeof Bun.serve> | null = null;
  let boundPort = 0;

  for (const port of portsToTry) {
    try {
      server = Bun.serve({ port, hostname: '127.0.0.1', fetch: fetchHandler });
      boundPort = port;
      break;
    } catch (err) {
      // EADDRINUSE → try next port
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EADDRINUSE' || code === 'EACCES') continue;
      // Unexpected error — rethrow
      throw err;
    }
  }

  if (!server) {
    // All specified ports busy — let the OS pick an ephemeral port
    server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: fetchHandler });
    boundPort = server.port;
  }

  return {
    port: boundPort,

    waitForCode(timeoutMs: number): Promise<string> {
      return new Promise<string>((res, rej) => {
        const timer = setTimeout(() => {
          rej(
            new CliError(
              'timeout',
              'OAuth callback timed out',
              'Re-run `openrouter auth login` to try again',
            ),
          );
        }, timeoutMs);

        codePromise.then(
          (code) => {
            clearTimeout(timer);
            res(code);
          },
          (err: Error) => {
            clearTimeout(timer);
            rej(err);
          },
        );
      });
    },

    stop(): void {
      try {
        server?.stop();
      } catch {
        /* best-effort */
      }
    },
  };
}
