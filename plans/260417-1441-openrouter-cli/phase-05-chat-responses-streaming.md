---
phase: 5
title: "Chat + Responses (beta) + TUI model picker"
status: completed
effort: "1.5d"
---

# Phase 05 — Chat + Responses + TUI model picker

## Context
- Docs: `docs/design-guidelines.md` §1 (verb table), §6 (streaming UX)
- Reports: `plans/reports/researcher-260417-1442-openrouter-api-reference.md` §4 (Chat), §15 (Responses beta)
- Depends on: phase-02 (SSE client), phase-03 (resolver), phase-04 (key)
- Unblocks: phase-12 (tests reference chat)

## Goal
`openrouter chat send` is the flagship command: streams tokens in TTY, emits NDJSON for agents, accepts stdin, supports tools/response-format/provider, and offers an interactive model picker. `openrouter responses create` mirrors the surface for OpenAI-compatible Beta Responses API (adds `--reasoning`, `--web-search`).

## Requirements
### Functional — chat
- `openrouter chat send [<message>|-] [--model M] [--system S] [--stream|--no-stream] [--temperature T] [--max-tokens N] [--top-p P] [--frequency-penalty F] [--presence-penalty P] [--stop X (repeatable)] [--tools file.json] [--response-format file.json] [--provider file.json] [--plugins file.json] [-i/--interactive]`
- Message source precedence: positional > stdin (if `-` or non-TTY stdin) > interactive prompt (TTY only)
- Default streaming when TTY; `--no-stream` forces single-shot response
- Pretty mode: tokens to stdout as they arrive, usage summary to stderr at end
- JSON mode: one envelope with full `choices[]`
- NDJSON mode: `{type:"delta", content:"…"}` per token + final `{type:"result", usage, finish_reason, generation_id}`
- SIGINT mid-stream: send abort, print partial usage, exit 0
- `-i`: @clack/prompts select — fetches `GET /models` once, filters by `--category`/supported params, fuzzy search

### Functional — responses
- `openrouter responses create` mirrors chat flags; adds `--reasoning <effort>`, `--web-search`, `--tools`
- Output distinguishes `reasoning_details` when present — pretty mode renders reasoning in dim color before answer

### Non-functional
- Message building is one function shared between `chat` and `responses`
- Large tools/response-format files validated via zod before sending
- Streaming back-pressure: drain writes before reading more from SSE

## Files to create
- `src/lib/chat/build-request.ts` — pure: `buildChatRequest(args, resolver): {body, headers}`; loads JSON files referenced by `--tools`/`--response-format`/`--provider`/`--plugins`; zod-validates (≤120 lines)
- `src/lib/chat/stream-handler.ts` — consumes `streamSSE(response)`, drives renderer: pretty (text), json (accumulate → envelope), ndjson (emit per delta + final) (≤150 lines)
- `src/lib/tui/model-picker.ts` — `pickModel({filter, categoryFilter})`: fetches `/models`, `@clack/prompts select` with fuzzy search, returns model id; TTY-only, throws if non-interactive (≤100 lines)
- `src/commands/chat.ts` — `send` (+ `completion` alias) verb (≤180 lines)
- `src/commands/responses.ts` — `create` verb (≤150 lines)

## Files to modify
- `src/lib/types/openrouter.ts` — extend with `ChatCompletionRequest`, `ChatCompletionStreamChunk`, `ResponsesRequest`, `ResponsesStreamChunk`, tool schemas (OpenAI-compatible)
- `src/main.ts` — register `chat` and `responses` subcommand groups

## Implementation steps
1. **build-request.ts**:
   - `buildChatRequest({message, system, model, tools, responseFormat, provider, plugins, ...params})`:
     - `messages = [...(system ? [{role:'system', content: system}] : []), {role:'user', content: message}]`
     - Read file-referenced flags via `fs.readFileSync`, zod-parse
     - Assemble body per `/chat/completions` spec; include `stream: true` when streaming
   - Pure: no network calls
2. **stream-handler.ts**:
   - `runStream(response, renderer, mode)`:
     - For each SSE event, zod-parse `ChatCompletionStreamChunk`:
       - `delta.content` → pretty: `process.stdout.write(content)`; ndjson: `emitNdjson({type:'delta', content})`; json: accumulate
       - `delta.tool_calls` → ndjson: emit `{type:'tool_call', ...}`; pretty: render dimmed
       - `finish_reason` set → capture
       - `usage` (from final `[DONE]` or last chunk) → capture
     - On end: mode='pretty' → `\n` + usage to stderr; mode='json' → `renderer(envelope(accumulated, meta))`; mode='ndjson' → `emitNdjson({type:'result', usage, finish_reason, generation_id})`
3. **model-picker.ts**:
   - Cache `/models` response (memory only, per session)
   - `@clack/prompts select({ message: 'Pick a model', options })`. Filter by category/supports
   - Non-TTY: throw `UsageError("--model required in non-interactive mode")`
4. **commands/chat.ts** — `send`:
   - Read message: if arg `-` OR stdin non-TTY → consume all stdin; else positional; else if TTY interactive → @clack/prompts text
   - If no `--model` and TTY → `pickModel()`; else error
   - `body = buildChatRequest(...)`
   - If streaming: `response = await client.request({path:'/chat/completions', method:'POST', auth:'user', body, stream:true})`; pass to `stream-handler`
   - Else: normal request → `render(envelope(data, meta))`
   - `completion` is an alias: register the same handler under `completion`
5. **commands/responses.ts** — `create`:
   - Same scaffolding as chat
   - Extra flags `--reasoning`, `--web-search`
   - `path: '/responses'`
   - Pretty mode: render `reasoning_details` dimmed before main content
6. Unit tests:
   - `build-request.test.ts`: messages assembly, tools/response-format file loading, zod rejection on malformed
   - `stream-handler.test.ts`: given canned SSE stream, assert NDJSON output matches fixture; accumulation for json mode
   - `chat.test.ts` e2e: spawn CLI with `Bun.serve` mock at `OPENROUTER_BASE_URL`, assert stdout/stderr
   - `responses.test.ts` e2e
7. Manual: pipe real message → verify JSON envelope; `-i` flow

## Todo checklist
- [x] `build-request.ts` shared builder
- [x] `stream-handler.ts` three output modes
- [x] `model-picker.ts` TUI + cache
- [x] `commands/chat.ts` (`send` + `completion` alias)
- [x] `commands/responses.ts` (`create` + reasoning/web-search)
- [x] Extend `types/openrouter.ts` schemas
- [x] `main.ts` wires both
- [x] Unit + e2e tests

## Completion notes
Phase 5 — 181 tests. Chat + Responses + TUI picker (stream-request.ts, chat/build-request.ts, stream-handler.ts, tui/model-picker.ts, commands/chat.ts, responses.ts).

## Success criteria
- `echo hi | openrouter chat send -` streams to stdout, exits 0
- `openrouter chat send hi --json` emits a valid envelope with `choices[0].message.content`
- `openrouter chat send hi --output ndjson` emits `delta` + final `result` lines
- SIGINT during stream: exit 0, partial usage printed to stderr
- `-i` picks a model via TUI in TTY mode; errors cleanly in CI
- `responses create` handles `reasoning_details` without crashing

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Model IDs change upstream | Fetch `/models` live for picker; pass-through unknown IDs |
| SSE stall (no bytes from server) | Timeout on signal; surface as exit 71 |
| Large tools payload OOM | Stream file via `Bun.file(...).stream()` — only if >1 MB |
| NDJSON line cut across chunks | Use `createParser` line buffering (already handled) |
| Reasoning details break rendering | Pretty mode tolerates missing field; passthrough in json |

## Rollback
Remove `commands/chat.ts`, `commands/responses.ts`, `src/lib/chat/`, `src/lib/tui/model-picker.ts`; drop chat/responses types.
