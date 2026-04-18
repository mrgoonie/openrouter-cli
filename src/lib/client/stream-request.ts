/**
 * Streaming variant of the HTTP client — returns raw Response without parsing the body.
 * Used for SSE endpoints where the caller drains the body via streamSSE().
 *
 * Retries on 429/5xx BEFORE headers arrive (i.e. on error status codes).
 * Once the server starts streaming (2xx), we do NOT retry mid-body.
 */

import type { RequestOpts } from './client.ts';
import { HTTPError, TimeoutError, extractMessage, mapStatusToCode } from './errors.ts';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRYABLE = new Set([429, 502, 503, 504]);

function buildUrl(base: string, path: string, query?: RequestOpts['query']): string {
  // Concatenate rather than using `new URL(path, base)` — see client.ts for rationale.
  const trimmedBase = base.replace(/\/+$/, '');
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${trimmedBase}${trimmedPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function buildHeaders(opts: RequestOpts): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': opts.httpReferer ?? 'https://github.com/user/openrouter-cli',
    'X-Title': opts.appName ?? 'openrouter-cli',
    Accept: 'text/event-stream',
  };
  if (opts.apiKey) h.Authorization = `Bearer ${opts.apiKey}`;
  if (opts.headers) Object.assign(h, opts.headers);
  return h;
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return Math.min(32_000, 1_000 * 2 ** attempt) + Math.random() * 500;
}

/**
 * Perform an HTTP request and return the raw Response (body unread).
 * Caller is responsible for draining / closing the response body.
 *
 * Retries transient errors (429/5xx) before headers are received.
 * Does NOT retry after a 2xx response begins streaming.
 */
export async function streamRequest(opts: RequestOpts): Promise<Response> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = buildUrl(baseUrl, opts.path, opts.query);
  const headers = buildHeaders(opts);
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Merge caller signal with timeout signal
    const signal: AbortSignal = (() => {
      if (!opts.signal) return controller.signal;
      const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal })
        .any;
      if (typeof anyFn === 'function') {
        return anyFn([opts.signal, controller.signal]);
      }
      const merged = new AbortController();
      const abort = () => merged.abort();
      (opts.signal as AbortSignal).addEventListener('abort', abort, { once: true });
      controller.signal.addEventListener('abort', abort, { once: true });
      return merged.signal;
    })();

    try {
      const res = await fetch(url, {
        method: opts.method,
        headers,
        body: bodyStr,
        signal,
      });

      clearTimeout(timer);

      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        // Drain body to release connection, then retry
        await res.body?.cancel();
        const delay = retryDelayMs(attempt, res.headers.get('Retry-After'));
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        lastError = new HTTPError(
          res.status,
          mapStatusToCode(res.status),
          `HTTP ${res.status}`,
          res.headers.get('x-request-id') ?? undefined,
        );
        continue;
      }

      if (!res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = await res.text().catch(() => undefined);
        }
        const code = mapStatusToCode(res.status);
        const message = extractMessage(body, `HTTP ${res.status}`);
        throw new HTTPError(
          res.status,
          code,
          message,
          res.headers.get('x-request-id') ?? undefined,
          body,
        );
      }

      // Return raw response — caller owns the body stream
      return res;
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof HTTPError) throw err;

      if (err instanceof Error && err.name === 'AbortError') {
        if (opts.signal?.aborted) throw err;
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }

      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = retryDelayMs(attempt, null);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('Stream request failed after retries');
}
