/**
 * Exponential-backoff polling generator for async jobs (e.g. video status).
 * Schedule: 2s → 3s → 5s → cap 10s (override via intervalMs / maxIntervalMs).
 */

import { TimeoutError } from './errors.ts';

export type PollOpts = {
  /** Starting interval in ms. Default: 2000. */
  intervalMs?: number;
  /** Hard cap on interval. Default: 10_000. */
  maxIntervalMs?: number;
  /** Overall deadline in ms from start. Throws TimeoutError when exceeded. */
  timeoutMs?: number;
  /** Caller-supplied AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;
};

const DEFAULT_INTERVALS = [2_000, 3_000, 5_000];
const DEFAULT_MAX_INTERVAL = 10_000;

function nextInterval(step: number, intervalMs: number, maxIntervalMs: number): number {
  // Use explicit schedule for first steps, then cap
  if (step < DEFAULT_INTERVALS.length) {
    return Math.min(DEFAULT_INTERVALS[step] ?? intervalMs, maxIntervalMs);
  }
  return maxIntervalMs;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      },
      { once: true },
    );
  });
}

/**
 * Repeatedly calls `fn`, yields each result, then waits before the next call.
 * Throws `TimeoutError` if `timeoutMs` elapses before `fn` indicates completion.
 *
 * Callers break the loop by returning from the `for await` or via AbortSignal.
 */
export async function* poll<T>(fn: () => Promise<T>, opts: PollOpts = {}): AsyncGenerator<T> {
  const {
    intervalMs = DEFAULT_INTERVALS[0] ?? 2_000,
    maxIntervalMs = DEFAULT_MAX_INTERVAL,
    timeoutMs,
    signal,
  } = opts;

  const deadline = timeoutMs !== undefined ? Date.now() + timeoutMs : undefined;
  let step = 0;

  while (true) {
    if (signal?.aborted) break;
    if (deadline !== undefined && Date.now() >= deadline) {
      throw new TimeoutError(`Poll timed out after ${timeoutMs}ms`);
    }

    const result = await fn();
    yield result;

    const delay = nextInterval(step, intervalMs, maxIntervalMs);
    step++;

    if (deadline !== undefined && Date.now() + delay >= deadline) {
      throw new TimeoutError(`Poll timed out after ${timeoutMs}ms`);
    }

    try {
      await sleep(delay, signal);
    } catch {
      break; // aborted during sleep
    }
  }
}
