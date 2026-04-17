---
phase: 9
title: "Management endpoints (keys/guardrails/org/analytics)"
status: completed
effort: "1d"
---

# Phase 09 — Management endpoints

## Context
- Docs: `docs/design-guidelines.md` §1 (verb table)
- Reports: `plans/reports/researcher-260417-1442-openrouter-api-reference.md` §3 (APIKeys), §9 (Guardrails), §12 (Org), §2 (Analytics)
- Depends on: phase-02–04
- Unblocks: phase-12

## Goal
Admin surface for org owners. All endpoints require `OPENROUTER_MANAGEMENT_KEY`. Destructive operations (delete key/guardrail) require TTY confirmation OR `--force` OR `--non-interactive` flag combo. Redact keys in logs.

## Requirements
### Functional — keys
- `openrouter keys list` — table `id · name · usage · limit · expires_at · created_at`
- `openrouter keys create --name N [--expires-at ISO] [--limit N] [--limit-reset daily|weekly|monthly]` — prints newly issued `key` (shown only once; warn user)
- `openrouter keys get <id>`
- `openrouter keys update <id> [--name …] [--limit …] [--expires-at …] [--limit-reset …]`
- `openrouter keys delete <id> [--force]` — TTY prompts; non-interactive requires `--force`

### Functional — guardrails
- `openrouter guardrails list`
- `openrouter guardrails create --from-file f.json` (spending limits + model restrictions + provider filters)
- `openrouter guardrails get/update/delete <id>` (delete with `--force` gating)
- `openrouter guardrails assign-keys <id> --keys k1,k2` → `POST /guardrails/{id}/keys/assign`
- `openrouter guardrails assign-members <id> --users u1,u2` → `POST /guardrails/{id}/members/assign`
- `openrouter guardrails assignments <id>` → `GET /guardrails/{id}/member-assignments`

### Functional — org
- `openrouter org members` — table of org members

### Functional — analytics
- `openrouter analytics activity [--date YYYY-MM-DD] [--key-hash H] [--user U]`
- Pretty: table grouped by endpoint (KISS, no charting)

### Non-functional
- All endpoints error with exit 64 + hint when mgmt key missing
- Destructive: `delete` verbs confirm `Delete key <id>? [y/N]:` on TTY; `--force` bypasses; `CI=1`/non-TTY → require `--force`, else exit 2 with hint
- Masked keys in list output

## Files to create
- `src/commands/keys.ts` — CRUD (≤180 lines)
- `src/commands/guardrails.ts` — CRUD + assignments (≤220 lines)
- `src/commands/org.ts` — `members` (≤70 lines)
- `src/commands/analytics.ts` — `activity` (≤100 lines)
- `src/lib/ui/confirm.ts` — `confirmDestructive(message, opts): Promise<boolean>` (TTY prompt via @clack/prompts; respects `--force`, `--non-interactive`) (≤50 lines)

## Files to modify
- `src/lib/types/openrouter.ts` — `ApiKeyObject`, `CreateKeyRequest`, `Guardrail`, `GuardrailAssignments`, `OrgMember`, `ActivityResponse`
- `src/main.ts` — wires 4 command groups

## Implementation steps
1. **ui/confirm.ts**: resolve TTY; if non-TTY → if `--force` true return true else throw `UsageError` (exit 2); if TTY → `@clack/prompts.confirm({ message, initialValue: false })`.
2. **commands/keys.ts**:
   - `list`: `GET /keys` (mgmt); table columns
   - `create`: `POST /keys` with validated body; print full key with warning `⚠ Store this key now — it will not be shown again`
   - `get`: `GET /keys/{id}`
   - `update`: `PATCH /keys/{id}` with only provided fields
   - `delete`: confirm → `DELETE /keys/{id}`
3. **commands/guardrails.ts**: CRUD + assign endpoints per report; delete gated by confirm; bulk assign reads comma-list into arrays.
4. **commands/org.ts**: `members` → `GET /organization/members` → table.
5. **commands/analytics.ts**: `activity` → `GET /activity` with query params → group by endpoint; pretty: table; JSON: passthrough.
6. All mgmt commands must pass `auth: 'mgmt'` to client so `resolveManagementKey` is used.
7. Unit tests:
   - `confirm.test.ts`: matrix TTY × --force × --non-interactive
   - `keys.test.ts`: create prints raw key once, delete prompts + bypasses
   - `guardrails.test.ts`: assign-keys/members shape
   - `analytics.test.ts`: grouping

## Todo checklist
- [x] `ui/confirm.ts`
- [x] `commands/keys.ts` (5 verbs)
- [x] `commands/guardrails.ts` (5 verbs + 3 assignment verbs)
- [x] `commands/org.ts` (members)
- [x] `commands/analytics.ts` (activity)
- [x] Extend zod schemas
- [x] `main.ts` wires 4 groups
- [x] Unit tests green

## Completion notes
Phase 9 — 340 tests. Management (ui/confirm.ts with force + non-TTY guard, commands/keys.ts, guardrails.ts, org.ts, analytics.ts with 8 verbs total).

## Success criteria
- `openrouter keys list --json | jq` returns array of `{id, name, …}`
- `openrouter keys delete <id>` in CI fails exit 2 with hint unless `--force`
- `openrouter guardrails assign-keys <id> --keys k1,k2` posts correct body
- `openrouter org members` + `openrouter analytics activity` render clean tables
- All mgmt commands exit 64 with helpful hint when `OPENROUTER_MANAGEMENT_KEY` missing

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Create endpoint returns one-time secret | Print prominent warning + suggest pipe into `openrouter auth set-key` |
| Bulk assign partial failure | API contract unclear — on non-2xx show response body as-is; document limitation |
| Destructive op in CI without `--force` | Hard fail with exit 2 + hint |
| Mgmt key accidentally logged | Redact in verbose; never stringify full header |
| Analytics date out of range | Pass through server error (400) untouched |

## Rollback
Remove `commands/keys.ts`, `commands/guardrails.ts`, `commands/org.ts`, `commands/analytics.ts`, `lib/ui/confirm.ts`, added schemas.
