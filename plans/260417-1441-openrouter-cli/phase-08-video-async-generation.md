---
phase: 8
title: "Video async generation"
status: completed
effort: "1d"
---

# Phase 08 — Video generation (async + polling)

## Context
- Docs: `docs/design-guidelines.md` §6 (polling UX)
- Reports: `plans/reports/researcher-260417-1442-openrouter-api-reference.md` §16 (VideoGeneration)
- Depends on: phase-02 (`poll()`), phase-03–04
- Unblocks: phase-12

## Goal
Full async lifecycle: submit video job (returns 202 with polling URL), check status, optionally wait with backoff + spinner/NDJSON ticks, and download resulting files. Resumable by job ID — users and agents can detach and reattach.

## Requirements
### Functional
- `openrouter video create --prompt <p> --model <m> [--aspect-ratio AR] [--duration s] [--resolution R] [--size WxH] [--frame-image path (repeatable)] [--generate-audio] [--provider file.json] [--wait] [--interval 2s] [--timeout 20m] [--download <dir>]`
  - Default (no `--wait`): 202 → print envelope with `{id, polling_url, status}` and exit 0
  - `--wait`: poll until terminal state; pretty: spinner + elapsed + status; NDJSON: one `{type:"status", status, elapsed_ms}` per tick + final `{type:"result", ...}`
  - `--download <dir>`: on completion, download `unsigned_urls[*]` concurrently; pretty bar per file
- `openrouter video status <id>`: single GET on the polling URL (or construct from id) → render status + URLs if completed
- `openrouter video wait <id> [--interval 2s] [--timeout 20m] [--download <dir>]`: reattach polling to existing job
- `openrouter video download <id> [--output <dir>]`: fetch `unsigned_urls[*]` → download concurrently
- SIGINT during `--wait`: print `{status:"detached", id}` to stderr, exit 0 (job still runs server-side)

### Non-functional
- Polling backoff: 2s → 3s → 5s → cap 10s; override via `--interval`
- Timeout default 20 min; configurable; exit 71 on timeout (job still exists)
- Downloads limited to 3 concurrent; streamed write (no full-buffer)
- `frame-image` files <2 MB: base64 `data:` URL; larger: mark TODO and error (research flags this as uncertain)

## Files to create
- `src/commands/video.ts` — verbs `create`, `status`, `wait`, `download` (≤200 lines)
- `src/lib/video/build-create-request.ts` — handles `frame-image` file reading → base64 data URL (≤80 lines)
- `src/lib/video/download-files.ts` — concurrent file download with progress (TTY) + NDJSON ticks (≤120 lines)
- `src/lib/video/poll-loop.ts` — orchestrates `poll()` over `{status fetch, ticker, completion predicate}` (≤80 lines)

## Files to modify
- `src/lib/types/openrouter.ts` — `VideoCreateRequest`, `VideoJob`, `VideoStatus = 'pending'|'in_progress'|'completed'|'failed'|'cancelled'|'expired'`
- `src/main.ts` — register `video` subcommand

## Implementation steps
1. **build-create-request.ts**: walk `frame-image` paths; if <2 MB → base64 `data:` URL; else throw with TODO comment referencing research unresolved Q. Include array `frame_images` in body.
2. **poll-loop.ts**:
   - Inputs `{fetchStatus, isTerminal, onTick, signal, intervalSchedule}`
   - Uses `poll()` from phase-02
   - Emits `onTick(status)` each iteration
   - Returns final status object
3. **download-files.ts**: for each URL in `unsigned_urls`, `fetch(url)`, stream `response.body` via `ReadableStream` → write file via `Bun.write`. Cap 3 concurrent via semaphore. Pretty: per-file progress via `@clack/prompts` progress (or simple line).
4. **commands/video.ts**:
   - `create`: build body via `build-create-request`; POST `/videos`; expect 202 → `{data: {id, polling_url, status}}`; if `--wait` → poll-loop; else render envelope + exit
   - `status <id>`: GET polling URL (stored or constructed: `/videos/{id}/status` per API); render
   - `wait <id>`: fetch once to get polling URL, then poll-loop; on completion + `--download` → download files
   - `download <id>`: fetch status, ensure completed, download URLs
   - SIGINT: listen via `AbortController`; on signal, emit detach message + exit 0
5. Unit tests:
   - `build-create-request.test.ts`: base64 embed works; large file refused with clear message
   - `poll-loop.test.ts`: transitions `pending → in_progress → completed`; timeout; cancellation
   - `download-files.test.ts`: concurrent download with mock server; partial failure leaves partial files
   - `video.test.ts` e2e with mock `Bun.serve`

## Todo checklist
- [x] `video/build-create-request.ts`
- [x] `video/poll-loop.ts`
- [x] `video/download-files.ts`
- [x] `commands/video.ts` (4 verbs)
- [x] Extend zod schemas
- [x] `main.ts` wires `video`
- [x] Unit + e2e tests

## Completion notes
Phase 8 — 306 tests. Video async (video/build-create-request.ts, poll-loop.ts, download-files.ts, commands/video.ts with create/status/wait/download + SIGINT detach, io/parse-duration.ts).

## Success criteria
- `openrouter video create --prompt "cat" --model X` returns 202 envelope with `id`, exits 0
- `--wait` polls cleanly; completes with `unsigned_urls`
- `--download .` fetches files, shows progress in TTY, exits 0
- `status <id>` is pipe-safe (NDJSON or JSON envelope)
- SIGINT during `--wait` prints detach message, exit 0; job remains server-side
- Exit 73 on `failed`/`expired`/`cancelled`

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Polling URL format changes | Read `polling_url` from create response directly; don't reconstruct |
| Timeout shorter than actual job | Configurable; on timeout print `{id, last_status}` so user can `wait <id>` later |
| Download mid-stream disconnect | Retry once with Range header if server supports; otherwise restart |
| frame-image strategy (base64 vs URL) uncertain | Ship base64 <2 MB; document TODO; ask user for clarification at onboarding |
| Concurrent downloads hit rate limit | Cap to 3; respect 429 → backoff |

## Rollback
Remove `commands/video.ts`, `lib/video/`, video schemas.
