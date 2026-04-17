---
phase: 2
title: "Core HTTP + output lib"
status: completed
effort: "1d"
---

# Phase 02 — Core HTTP + output lib

## Context
- Docs: `docs/design-guidelines.md` §4 (output), §5 (exit codes), §7 (errors); `docs/tech-stack.md` (client deps)
- Reports: `plans/reports/researcher-260417-1441-cli-agent-friendly-patterns.md` (NDJSON/SSE/TTY)
- Depends on: phase-01
- Unblocks: phase-03 (config), phase-04–09 (all commands)

## Goal
Build the HTTP client (fetch wrapper with auth/headers/retries/SSE/poll), the output renderer (JSON envelope + NDJSON + pretty tables + TTY detection), and the typed error → exit code mapper. Every command in phases 4–9 consumes these primitives.

## Requirements
### Functional
- `request()` wraps `fetch` — auth header (user OR mgmt, per endpoint class), `HTTP-Referer`, `X-Title`, timeout (AbortController), retry on 429/5xx with exponential backoff (max 3), captures `X-Generation-Id` + `X-Request-Id`
- `stream()` yields SSE events via `eventsource-parser`; ignores `: OPENROUTER PROCESSING` keep-alives; stops on `data: [DONE]`; forwards `AbortSignal`
- `poll()` exponential backoff: 2s→3s→5s→cap 10s, with overall timeout
- `renderer` auto-resolves `json|ndjson|table|text|yaml` from flag + TTY
- JSON envelope: `{schema_version:"1", success, data, error, meta:{request_id, elapsed_ms, generation_id}}`
- Errors map HTTP status → typed code → exit code per §5 table
- Stdout = data; stderr = progress/warn/verbose
- `NO_COLOR` + `!isTTY` disable ANSI
- `CI=1` or non-TTY → non-interactive mode, no prompts, no spinners

### Non-functional
- Zero circular imports between `client/`, `output/`, `errors/`
- All exports typed · no `any`
- ≤200 lines per file (split if needed)
- All responses validated via zod before returning `data`

## Files to create
- `src/lib/client/client.ts` — `request<T>(opts): Promise<{data, headers, status, requestId, generationId, elapsedMs}>`; `opts: { path, method, auth:'user'|'mgmt', body?, query?, signal?, timeout?, headers? }`; chooses key via callbacks injected from resolver (resolver wired in phase-03); retries 429/5xx up to 3× with jitter; parses `Retry-After` (≤120 lines)
- `src/lib/client/errors.ts` — `HTTPError` class with `{status, code, message, requestId, body}`; `mapStatusToCode(status)` → string; `mapCodeToExit(code)` → number (≤80 lines)
- `src/lib/client/sse.ts` — `async function* streamSSE(response, signal)` yielding `{event, data: unknown}` using `eventsource-parser`; terminates on `[DONE]`; skips lines starting with `:` (≤80 lines)
- `src/lib/client/poll.ts` — `async function* poll(fn, {intervalMs, timeoutMs, signal})` — exponential 2→3→5→cap 10s; yields each result; throws `TimeoutError` (exit 71) on timeout; SIGINT-safe via passed signal (≤70 lines)
- `src/lib/output/renderer.ts` — `render(result, opts)`; `opts: {format, noColor}`; dispatches to json/ndjson/table/text; success vs error envelope (≤100 lines)
- `src/lib/output/json.ts` — `envelope(data, meta)`, `errorEnvelope(err, meta)`, `SCHEMA_VERSION = '1'`; `emitNdjson(line)` writes `JSON.stringify(line) + '\n'` to stdout and flushes (≤60 lines)
- `src/lib/output/table.ts` — wrapper around `cli-table3`: `renderTable(rows, columns)` with auto column widths; `NO_COLOR`-aware (≤80 lines)
- `src/lib/output/tty.ts` — `isTTY()`, `isCI()` (check `CI`, `GITHUB_ACTIONS`, `BUILDKITE`, etc.), `isNonInteractive()`, `shouldColor()`, `resolveOutputMode(flag): 'json'|'ndjson'|'table'|'text'|'yaml'|'pretty'` (≤60 lines)
- `src/lib/errors/exit-codes.ts` — enum `ExitCode { OK=0, GENERIC=1, USAGE=2, NO_KEY=64, UNAUTHORIZED=65, FORBIDDEN=66, NOT_FOUND=67, INSUFFICIENT_CREDITS=68, RATE_LIMITED=69, SERVER_ERROR=70, TIMEOUT=71, INVALID_RESPONSE=72, ASYNC_JOB_FAILED=73 }`; `exitWith(err): never` (≤60 lines)
- `src/lib/types/openrouter.ts` — starting zod schemas: `ChatMessage`, `ChatChoice`, `ChatCompletionResponse`, `Model`, `Provider`, `Generation`, `VideoJob`, `ApiKey`, `Guardrail`, `OrgMember`; extended in later phases (≤200 lines, split if bigger)
- `src/lib/types/config.ts` — zod schema for the TOML config (matches §10) (≤60 lines)

## Files to modify
- none (yet); `src/main.ts` will wire global flags in phase-03

## Implementation steps
1. **errors/exit-codes.ts** — enum + `exitWith(err)` that writes error envelope to stderr (or stdout if `--json`) and calls `process.exit(code)`.
2. **client/errors.ts** — `HTTPError` extends `Error` with `{status, code, message, requestId, body}`. `mapStatusToCode`: 401→`unauthorized`, 402→`insufficient_credits`, 403→`forbidden`, 404→`not_found`, 429→`rate_limited`, 5xx→`server_error`. JSON parse fail → `invalid_response`.
3. **output/tty.ts** — `isTTY()` = `process.stdout.isTTY === true`. `isCI()` checks common CI env vars. `resolveOutputMode('auto')` → `'pretty'` if TTY && stdout, else `'json'`.
4. **output/json.ts** — export `SCHEMA_VERSION = '1'`. `envelope(data, meta)` returns `{schema_version:'1', success:true, data, error:null, meta}`. `errorEnvelope(err, meta)` returns `{schema_version:'1', success:false, data:null, error:{code, message, hint?, status?, request_id?}, meta}`. `emitNdjson(obj)` writes one line + `\n` to stdout via `process.stdout.write`.
5. **output/table.ts** — `renderTable(rows, columns)` builds `Table` with `head: columns.map(c => c.header)`; maps rows. Respect `NO_COLOR`.
6. **output/renderer.ts** — `render(result, {format, noColor})`: 'json' → `console.log(JSON.stringify(envelope(result.data, meta), null, 2))`; 'ndjson' → `emitNdjson(envelope(...))`; 'table' → `renderTable(result.data, columns)`; 'text'/'pretty' → human text; 'yaml' → via `yaml` package OR mark unsupported in v1 (choose: mark TODO).
7. **client/client.ts** — `request<T>`:
   - Build URL from `baseUrl + path + querystring`
   - Headers: `Authorization: Bearer ${key}`, `Content-Type: application/json`, optional `HTTP-Referer`, `X-Title`
   - `AbortController` with timeout
   - `fetch(url, {method, headers, body: body && JSON.stringify(body), signal})`
   - Retry loop: on status 429/5xx, parse `Retry-After` (seconds) or use backoff (1s → 2s → 4s + jitter), max 3 attempts
   - On non-2xx after retries: parse body JSON (best effort) → throw `HTTPError`
   - On 2xx: capture headers `x-request-id`, `x-generation-id`; return `{data, headers, status, requestId, generationId, elapsedMs: Date.now() - start}`
8. **client/sse.ts** — Use `createParser` from `eventsource-parser`; iterate `response.body` via `getReader()`; for each `{type:'event', data}`, yield parsed JSON (skip `[DONE]`); skip comment lines starting with `:`.
9. **client/poll.ts** — generator that calls `fn()`; yields result; sleeps `Math.min(10_000, prev*1.5)` starting at 2000ms; respects signal.
10. **types/openrouter.ts** — author the zod schemas listed above, loose (`.passthrough()`) to pass unknown fields per risk mitigation (schema drift).
11. **Unit tests** (`tests/unit/*.test.ts`):
    - `errors.test.ts`: status→code mapping, code→exit mapping
    - `json.test.ts`: envelope shape (schema_version, success/error), NDJSON emission
    - `tty.test.ts`: `resolveOutputMode` with TTY mocked
    - `sse.test.ts`: parses `data: {...}\n\ndata: [DONE]\n\n`, skips `:` keepalive
    - `poll.test.ts`: backoff progression + timeout
    - `client.test.ts`: retries on 429 honoring `Retry-After`; surfaces `HTTPError` after max attempts — use `Bun.serve` fixture

## Todo checklist
- [x] `exit-codes.ts` enum + `exitWith`
- [x] `client/errors.ts` HTTPError + mappers
- [x] `output/tty.ts` TTY + CI detection
- [x] `output/json.ts` envelope + NDJSON
- [x] `output/table.ts` cli-table3 wrapper
- [x] `output/renderer.ts` format dispatcher
- [x] `client/client.ts` fetch wrapper + retries
- [x] `client/sse.ts` eventsource-parser wrapper
- [x] `client/poll.ts` exponential backoff generator
- [x] `types/openrouter.ts` starter zod schemas (`.passthrough()`)
- [x] `types/config.ts` TOML schema
- [x] Unit tests for all of the above

## Completion notes
Phase 2 — 50 unit tests, core HTTP+output lib shipped (client.ts, sse.ts, poll.ts, output/renderer.ts, output/json.ts, output/table.ts, output/tty.ts, errors/exit-codes.ts, client/errors.ts, types/openrouter.ts, types/config.ts).

## Success criteria
- Every unit test passes (`bun test`)
- `HTTPError` serializes cleanly into error envelope
- `stream()` handles OpenRouter keep-alives without emitting spurious events
- `poll()` timeouts cleanly (doesn't hang test suite)
- Envelope output validates against `schema_version:"1"` golden fixture

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| OpenRouter adds new fields later | zod `.passthrough()` on all response schemas |
| Mgmt key accidentally sent to user endpoints | `auth:'user'\|'mgmt'` parameter required, resolver selects correct key |
| Retry storm on persistent 5xx | Max 3 attempts + `Retry-After` respected |
| SSE stream hangs on dead connection | Wire `AbortController` + caller-supplied timeout |
| JSON parse fails on HTML error page | Wrap parse in try/catch → `invalid_response` (exit 72) |

## Rollback
Remove `src/lib/` subtree. No commands depend on it yet.
