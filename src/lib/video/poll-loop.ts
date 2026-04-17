/**
 * High-level polling orchestrator for async video jobs.
 * Wraps the generic poll() generator with video-specific terminal state detection,
 * tick callbacks, and error mapping.
 */

import { poll } from '../client/poll.ts';
import { CliError } from '../errors/exit-codes.ts';
import type { VideoJob } from '../types/openrouter.ts';

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'expired']);
const FAILED_STATES = new Set(['failed', 'cancelled', 'expired']);

export type PollJobOpts = {
  /** Fetches the current video job status from the API. */
  fetchStatus: () => Promise<VideoJob>;
  /** Override poll interval in ms (default: uses 2→3→5→10s backoff schedule). */
  intervalMs?: number;
  /** Max wait in ms before throwing TimeoutError (default: 20 minutes). */
  timeoutMs?: number;
  /** AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;
  /** Called on each non-terminal status tick. */
  onTick?: (status: VideoJob, elapsedMs: number) => void;
};

/**
 * Poll a video job until it reaches a terminal state.
 *
 * Returns the completed VideoJob on success.
 * Throws CliError('async_job_failed') for failed/cancelled/expired states.
 * Throws TimeoutError (from poll()) if timeoutMs is exceeded.
 */
export async function pollJob(opts: PollJobOpts): Promise<VideoJob> {
  const {
    fetchStatus,
    intervalMs,
    timeoutMs = 20 * 60 * 1000, // 20 minutes
    signal,
    onTick,
  } = opts;

  const start = Date.now();

  const pollOpts = {
    ...(intervalMs !== undefined ? { intervalMs, maxIntervalMs: intervalMs } : {}),
    timeoutMs,
    signal,
  };

  for await (const status of poll(fetchStatus, pollOpts)) {
    const elapsed = Date.now() - start;

    if (TERMINAL_STATES.has(status.status)) {
      // Terminal: failed/cancelled/expired → throw
      if (FAILED_STATES.has(status.status)) {
        throw new CliError(
          'async_job_failed',
          `video job ${status.status}${status.error ? `: ${status.error}` : ''}`,
        );
      }
      // Terminal: completed → return
      return status;
    }

    // Non-terminal: call tick callback
    onTick?.(status, elapsed);
  }

  // Should not reach here — poll() either yields until broken or throws TimeoutError
  throw new CliError('async_job_failed', 'video job polling ended unexpectedly');
}
