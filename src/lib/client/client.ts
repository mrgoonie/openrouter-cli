/**
 * Core HTTP client — fetch wrapper with auth headers, timeout, retry logic,
 * and response metadata capture. No key resolution here (wired in phase-03).
 */

import { HTTPError, TimeoutError, extractMessage, mapStatusToCode } from './errors.ts';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

export type RequestOpts = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 'user' = OPENROUTER_API_KEY bearer; 'mgmt' = management key bearer. */
  auth: 'user' | 'mgmt';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  baseUrl?: string;
  /** Pass key directly (resolver injected from phase-03 context). */
  apiKey?: string;
  httpReferer?: string;
  appName?: string;
};

export type RequestResult<T> = {
  data: T;
  /** Raw response headers — typed as unknown to avoid lib.dom vs @types/bun mismatch. */
  headers: { get(name: string): string | null };
  status: number;
  requestId: string | undefined;
  generationId: string | undefined;
  elapsedMs: number;
};

function buildUrl(base: string, path: string, query?: RequestOpts['query']): string {
  // Concatenate rather than using `new URL(path, base)` — a path starting with
  // "/" would otherwise replace the base path (e.g. `/models` against
  // `https://openrouter.ai/api/v1/` yields `https://openrouter.ai/models`).
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
  // Exponential backoff with jitter: min(32s, 1s * 2^n) + rand(0..500ms)
  return Math.min(32_000, 1_000 * 2 ** attempt) + Math.random() * 500;
}

const RETRYABLE = new Set([429, 502, 503, 504]);

/** Perform an HTTP request with timeout, retry, and envelope header capture. */
export async function request<T>(opts: RequestOpts): Promise<RequestResult<T>> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = buildUrl(baseUrl, opts.path, opts.query);
  const headers = buildHeaders(opts);
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  const start = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Merge caller signal with timeout signal.
    // AbortSignal.any is available in Bun 1.x; fall back to manual race if absent.
    const signal: AbortSignal = (() => {
      if (!opts.signal) return controller.signal;
      const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal })
        .any;
      if (typeof anyFn === 'function') {
        return anyFn([opts.signal, controller.signal]);
      }
      // Fallback: manual abort-on-either
      const merged = new AbortController();
      const abort = () => merged.abort();
      // opts.signal is non-null here (checked above)
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

      const data = (await res.json()) as T;
      return {
        data,
        headers: res.headers,
        status: res.status,
        requestId: res.headers.get('x-request-id') ?? undefined,
        generationId: res.headers.get('x-generation-id') ?? undefined,
        elapsedMs: Date.now() - start,
      };
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof HTTPError) throw err;

      // AbortError from timeout (not caller signal)
      if (err instanceof Error && err.name === 'AbortError') {
        if (opts.signal?.aborted) throw err; // caller cancelled — re-throw
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }

      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = retryDelayMs(attempt, null);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}
