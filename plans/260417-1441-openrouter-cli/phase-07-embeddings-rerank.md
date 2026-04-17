---
phase: 7
title: "Embeddings + Rerank"
status: completed
effort: "0.5d"
---

# Phase 07 — Embeddings + Rerank

## Context
- Docs: `docs/design-guidelines.md` §1
- Reports: `plans/reports/researcher-260417-1442-openrouter-api-reference.md` §6 (Embeddings), §14 (Rerank)
- Depends on: phase-02–04
- Unblocks: phase-12

## Goal
One-shot `POST` endpoints with file/stdin input paths. Embeddings vectors are big — prefer JSON mode for agents and compact summary for humans. Rerank outputs a ranked list (natural table form).

## Requirements
### Functional
- `openrouter embeddings create --model M [--input <text> | --input-file f] [--dimensions N] [--encoding-format float|base64] [--input-type T] [--provider file.json]`
  - Stdin supported when no `--input`/`--input-file` and stdin non-TTY: read whole stdin
  - Batch: `--input-file` with one line per input → sends array
  - Pretty mode: `N × D vectors, cost $X` summary only; `--show-vectors` prints vectors (can be huge)
  - JSON mode: full passthrough
- `openrouter rerank run --query Q --docs <file|-> --model M [--top-n N] [--provider file.json]`
  - `--docs` accepts `-` (stdin) or path; one doc per line
  - Pretty mode: ranked table `rank · score · doc (truncated 80 char)`
  - JSON mode: full passthrough
  - Exit code 2 if `<2` docs

### Non-functional
- File reads use Bun.file streaming for large inputs
- Refuse input >10 MB unless `--allow-large` (protect API costs)
- Validate all inputs against zod before sending

## Files to create
- `src/commands/embeddings.ts` — `create` verb (≤150 lines)
- `src/commands/rerank.ts` — `run` verb (≤120 lines)
- `src/lib/io/input-reader.ts` — `readInputArg(arg, stdinFallback): Promise<string|string[]>` — handles `-` stdin, file path, inline string; `readLinesFromSource(source): string[]` (≤80 lines)

## Files to modify
- `src/lib/types/openrouter.ts` — add `EmbeddingRequest`, `EmbeddingResponse`, `RerankRequest`, `RerankResponse`
- `src/main.ts` — register `embeddings` + `rerank`

## Implementation steps
1. **input-reader.ts**:
   - `readInputArg(arg?, stdinNonTTY)`: if `arg === '-'` or (arg missing + stdinNonTTY) → read stdin; if arg path exists → read file; else treat arg as inline string
   - `readLinesFromSource(text)`: split on `\n`, trim, drop empties
2. **commands/embeddings.ts** — `create`:
   - Collect inputs via `readInputArg` + optional `readLinesFromSource` when `--input-file` has newlines
   - Size check → refuse if >10 MB unless `--allow-large`
   - `body = {input, model, dimensions?, encoding_format?, input_type?, provider?}`
   - `client.request({path:'/embeddings', method:'POST', auth:'user', body})`
   - Pretty: `${data.data.length} × ${data.data[0].embedding.length} vectors · cost $${data.usage.cost}`; hide vectors unless `--show-vectors`
   - JSON: full passthrough
3. **commands/rerank.ts** — `run`:
   - `docs = readLinesFromSource(await readInputArg(opts.docs, true))`
   - Error if `docs.length < 2`
   - `body = {query, documents: docs, model, top_n, provider}`
   - `client.request({path:'/rerank', method:'POST', auth:'user', body})`
   - Pretty table: sort by `relevance_score` desc, show `rank · score (.3f) · document (truncate 80)`
   - JSON: passthrough
4. Unit tests:
   - `input-reader.test.ts`: stdin / file / inline cases
   - `embeddings.test.ts`: large input refusal, summary rendering, JSON passthrough
   - `rerank.test.ts`: <2 docs error, table sort, top-N

## Todo checklist
- [x] `io/input-reader.ts`
- [x] `commands/embeddings.ts`
- [x] `commands/rerank.ts`
- [x] Extend zod schemas
- [x] `main.ts` wires both
- [x] Unit tests green

## Completion notes
Phase 7 — 262 tests. Embeddings + Rerank (io/input-reader.ts, commands/embeddings.ts, rerank.ts).

## Success criteria
- `cat doc.txt | openrouter embeddings create --model openai/text-embedding-3-small --json | jq '.data.data[0].embedding|length'` prints dimension
- `openrouter rerank run --query "hello" --docs lines.txt --model mistralai/mistral-embed` emits ranked table
- Refuses `--input-file` >10 MB with clear error + hint
- `--show-vectors` renders vectors only when requested

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Huge vector output overwhelms terminal | Default to summary; `--show-vectors` opt-in |
| Stdin read blocks indefinitely | Detect non-TTY before awaiting; error if interactive without args |
| Encoding-format `base64` vs `float` rendering | In summary, note encoding type; JSON unchanged |
| Unicode docs lines corrupted | Read as UTF-8 always; test with CJK fixtures |

## Rollback
Remove `commands/embeddings.ts`, `commands/rerank.ts`, `io/input-reader.ts`, added schemas.
