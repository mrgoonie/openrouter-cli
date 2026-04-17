---
phase: 6
title: "Models + Providers + Generations + Credits"
status: completed
effort: "1d"
---

# Phase 06 — Models + Providers + Endpoints + Generations + Credits

## Context
- Docs: `docs/design-guidelines.md` §1
- Reports: `plans/reports/researcher-260417-1442-openrouter-api-reference.md` §7, §8, §10, §13, §5
- Depends on: phase-02–04
- Unblocks: phase-12

## Goal
Read-only information commands agents invoke frequently and humans browse interactively. Cover models listing/details, endpoint introspection per model, provider catalog, generation lookup by ID, and account credits.

## Requirements
### Functional
- `openrouter models list [--category C] [--supported-parameters P,…] [--output-modalities M,…]`
  - Pretty: table `id · context_length · input/output price · top_provider`
  - JSON: envelope passthrough
- `openrouter models get <id>` — single model details incl. pricing + architecture
- `openrouter models endpoints <author>/<slug>` — `GET /models/{a}/{s}/endpoints`; pretty lists endpoints with latency + uptime + price
- `openrouter providers list` — pretty table `id · name · status · models_count`
- `openrouter generations get <id>` — full metadata
- `openrouter generations cost <id>` — just `total_cost` number (stdout) for script use
- `openrouter credits show` — `total_credits_purchased - total_credits_used = remaining`; requires mgmt key

### Non-functional
- All commands respect `--output`/`--json` uniformly
- Caching for `/models` within a session (TTL: 60 s) to speed up picker + subsequent queries
- `credits show` prints warning when mgmt key missing (exit 64)

## Files to create
- `src/commands/models.ts` — `list`, `get`, `endpoints` verbs (≤180 lines)
- `src/commands/providers.ts` — `list` verb (≤80 lines)
- `src/commands/generations.ts` — `get`, `cost` verbs (≤120 lines)
- `src/commands/credits.ts` — `show` verb (≤80 lines)
- `src/lib/cache/memory-cache.ts` — tiny TTL map: `getOrSet<K, V>(key, ttlMs, fn)` (≤50 lines)

## Files to modify
- `src/lib/types/openrouter.ts` — extend with `ModelListResponse`, `ModelEndpointsResponse`, `ProviderList`, `GenerationDetail`, `CreditsResponse`
- `src/main.ts` — register 4 new command groups

## Implementation steps
1. **memory-cache.ts**: `Map<string, {value, expiresAt}>`; `getOrSet(key, ttlMs, fn)` returns cached value or calls `fn` and caches.
2. **commands/models.ts**:
   - `list`: `client.request({path:'/models', query:{category, supported_parameters, output_modalities}, auth:'user'})` → zod parse → renderer (table columns: `id`, `context_length`, `pricing.prompt`, `pricing.completion`, `top_provider`)
   - `get <id>`: call list then filter client-side (API lacks single-get per research); render detail card in pretty mode, full JSON otherwise
   - `endpoints <slug>`: parse `author/slug`; `client.request({path: \`/models/${author}/${slug}/endpoints\`})`; render table
3. **commands/providers.ts**: `list`: `GET /providers`; table.
4. **commands/generations.ts**:
   - `get <id>`: `GET /generation?id=<id>`; pretty detail card or JSON envelope
   - `cost <id>`: same call, print `data.total_cost` as number to stdout (so `openrouter generations cost id | awk` works)
5. **commands/credits.ts**: `show`: `GET /credits` with mgmt auth; render `purchased / used / remaining`. If mgmt key missing → `exitWith(NO_KEY, hint: 'Set OPENROUTER_MANAGEMENT_KEY or run openrouter auth set-key <k> --management')`.
6. Extend `types/openrouter.ts` schemas (use `.passthrough()` per cross-phase rule).
7. Unit tests per command — mocked `Bun.serve` fixture returning canned JSON; assert stdout shape + exit code + table widths.

## Todo checklist
- [x] `cache/memory-cache.ts`
- [x] `commands/models.ts` (list/get/endpoints)
- [x] `commands/providers.ts` (list)
- [x] `commands/generations.ts` (get/cost)
- [x] `commands/credits.ts` (show)
- [x] Extend zod schemas
- [x] `main.ts` wires 4 groups
- [x] Unit tests green

## Completion notes
Phase 6 — 203 tests. Models/Providers/Generations/Credits (cache/memory-cache.ts, commands/models.ts, providers.ts, generations.ts, credits.ts).

## Success criteria
- `openrouter models list --json | jq '.data[0].id'` returns a model id
- `openrouter models endpoints anthropic/claude-opus-4-7` returns a table or JSON
- `openrouter generations cost <id>` prints just a number (pipe-safe)
- `openrouter credits show` exits 64 with helpful hint when mgmt key absent

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Pricing fields change (e.g. tiered) | Render `JSON.stringify(pricing)` fallback when unrecognized |
| Generation not yet queryable (async delay) | 404 maps to exit 67 with hint "try again in a few seconds" |
| Huge `/models` response in TTY | Default pager when output >rows; disable with `--no-pager` |
| `author/slug` parse edge cases | Validate format with regex `[\w-]+/[\w-.]+`; error exit 2 |

## Rollback
Remove 4 command files + cache helper + added schemas + main.ts wiring.
