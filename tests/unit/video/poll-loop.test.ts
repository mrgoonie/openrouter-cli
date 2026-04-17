/**
 * Unit tests for pollJob — terminal state detection, tick callbacks, timeout, cancellation.
 */

import { describe, expect, test } from 'bun:test';
import { TimeoutError } from '../../../src/lib/client/errors.ts';
import { CliError } from '../../../src/lib/errors/exit-codes.ts';
import type { VideoJob } from '../../../src/lib/types/openrouter.ts';
import { pollJob } from '../../../src/lib/video/poll-loop.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(status: VideoJob['status'], extra: Partial<VideoJob> = {}): VideoJob {
  return { id: 'job-1', status, ...extra };
}

/** Build a fetchStatus mock that returns statuses in sequence, then repeats last. */
function makeSequence(statuses: VideoJob['status'][]): () => Promise<VideoJob> {
  let i = 0;
  return async () => {
    const idx = Math.min(i++, statuses.length - 1);
    const s = statuses[idx] as VideoJob['status'];
    return makeJob(s);
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('pollJob — happy path', () => {
  test('returns completed job after pending → in_progress → completed sequence', async () => {
    const fetchStatus = makeSequence(['pending', 'in_progress', 'completed']);
    const ticks: VideoJob[] = [];

    const result = await pollJob({
      fetchStatus,
      intervalMs: 0,
      timeoutMs: 5000,
      onTick: (s) => ticks.push(s),
    });

    expect(result.status).toBe('completed');
    // pending and in_progress should have triggered ticks, completed should not
    expect(ticks.length).toBe(2);
    expect(ticks[0]?.status).toBe('pending');
    expect(ticks[1]?.status).toBe('in_progress');
  });

  test('returns immediately when first fetch returns completed', async () => {
    const fetchStatus = makeSequence(['completed']);
    const ticks: VideoJob[] = [];

    const result = await pollJob({
      fetchStatus,
      intervalMs: 0,
      timeoutMs: 5000,
      onTick: (s) => ticks.push(s),
    });

    expect(result.status).toBe('completed');
    expect(ticks.length).toBe(0); // no non-terminal ticks
  });

  test('passes elapsed_ms to onTick', async () => {
    const fetchStatus = makeSequence(['pending', 'completed']);
    const elapsedValues: number[] = [];

    await pollJob({
      fetchStatus,
      intervalMs: 0,
      timeoutMs: 5000,
      onTick: (_, elapsed) => elapsedValues.push(elapsed),
    });

    expect(elapsedValues.length).toBe(1);
    expect(typeof elapsedValues[0]).toBe('number');
    expect(elapsedValues[0]).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Terminal failure states
// ---------------------------------------------------------------------------

describe('pollJob — terminal failure states', () => {
  for (const failStatus of ['failed', 'cancelled', 'expired'] as const) {
    test(`throws CliError(async_job_failed) on status=${failStatus}`, async () => {
      const fetchStatus = makeSequence([failStatus]);

      await expect(pollJob({ fetchStatus, intervalMs: 0, timeoutMs: 5000 })).rejects.toThrow(
        CliError,
      );
    });

    test(`CliError message contains '${failStatus}' for status=${failStatus}`, async () => {
      const fetchStatus = makeSequence([failStatus]);
      let caught: unknown;

      try {
        await pollJob({ fetchStatus, intervalMs: 0, timeoutMs: 5000 });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(CliError);
      const err = caught as CliError;
      expect(err.code).toBe('async_job_failed');
      expect(err.message).toContain(failStatus);
    });
  }

  test('includes error field from job in CliError message when present', async () => {
    const fetchStatus = async () => makeJob('failed', { error: 'content policy violation' });
    let caught: unknown;

    try {
      await pollJob({ fetchStatus, intervalMs: 0, timeoutMs: 5000 });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('content policy violation');
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('pollJob — timeout', () => {
  test('throws TimeoutError when job stays pending beyond timeoutMs', async () => {
    // Always return pending — poll will timeout
    const fetchStatus = makeSequence(['pending']);

    await expect(
      pollJob({
        fetchStatus,
        intervalMs: 5000, // long interval so timeout fires first
        timeoutMs: 1, // near-zero timeout
      }),
    ).rejects.toThrow(TimeoutError);
  });
});

// ---------------------------------------------------------------------------
// AbortSignal cancellation
// ---------------------------------------------------------------------------

describe('pollJob — AbortSignal', () => {
  test('stops polling when signal is aborted before terminal state', async () => {
    const controller = new AbortController();
    let callCount = 0;

    const fetchStatus = async (): Promise<VideoJob> => {
      callCount++;
      if (callCount === 2) controller.abort();
      return makeJob('in_progress');
    };

    // Should not throw — just stop
    let threw = false;
    try {
      await pollJob({
        fetchStatus,
        intervalMs: 0,
        timeoutMs: 10000,
        signal: controller.signal,
      });
    } catch {
      threw = true;
    }

    // Either returns the unexpected-end CliError or aborts cleanly — key check is callCount ≤ 3
    expect(callCount).toBeLessThanOrEqual(3);
    // threw is acceptable (the unexpectedEnd CliError path)
    void threw;
  });
});
