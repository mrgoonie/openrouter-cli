---
phase: 12
title: "Tests + docs polish"
status: completed
effort: "1d"
---

# Phase 12 — Tests + docs polish

## Context
- Docs: all of `docs/*` — extend and verify
- Depends on: phases 1–11
- Unblocks: launch

## Goal
Raise coverage to acceptable floor, add CLI end-to-end tests against a local mock server (no live OpenRouter hits), snapshot critical outputs, and polish docs so a new contributor or AI agent can get productive in <10 minutes.

## Requirements
### Functional — tests
- Unit tests for every `src/lib/*` module (phases 2–10 already add per-phase tests — audit coverage here)
- End-to-end tests via subprocess:
  - Spin `Bun.serve` fixture at a free port, set `OPENROUTER_BASE_URL` in child env
  - Run compiled `bin/openrouter` (after `bun run build`) with canned inputs
  - Assert stdout/stderr/exit code
- Golden fixtures for:
  - `openrouter --help` and per-command help
  - `openrouter <cmd> --json` for each read-only endpoint
  - Error envelopes (401, 402, 404, 429, 500)
- Coverage gate in CI: `bun test --coverage`, fail if `<70%` lines

### Functional — docs
- `docs/codebase-summary.md` — file-by-file purpose table
- `docs/code-standards.md` — TypeScript conventions, test patterns
- `docs/system-architecture.md` — request lifecycle diagram (Mermaid), module boundaries
- `docs/deployment-guide.md` — consumer install paths + contributor release steps
- `docs/project-roadmap.md` — v1 → v2 → v3 milestones
- `README.md` full rewrite — install, quickstart (chat + video + agent mode), env table, exit codes, troubleshooting, link to `docs/`
- `.env.example` — commented template

### Non-functional
- All docs ≤800 lines (repo rule)
- Mermaid diagrams render in GitHub
- Examples runnable as copy-paste

## Files to create
- `tests/e2e/help.test.ts` — snapshots for all `--help` outputs
- `tests/e2e/chat.test.ts` — chat send in json/ndjson/pretty modes against mock
- `tests/e2e/video.test.ts` — video create → wait → download with mock job lifecycle
- `tests/e2e/auth.test.ts` — login flow with mocked loopback + `/auth/keys`
- `tests/e2e/config.test.ts` — `config doctor` across env/dotenv/file
- `tests/fixtures/responses/*.json` — canned OpenRouter responses per endpoint
- `tests/fixtures/mock-server.ts` — `Bun.serve` fixture with routes + job state machine for video
- `tests/fixtures/golden/*.txt` — expected help / error envelope snapshots
- `docs/codebase-summary.md`
- `docs/code-standards.md`
- `docs/system-architecture.md`
- `docs/deployment-guide.md`
- `docs/project-roadmap.md`
- `.env.example`

## Files to modify
- `README.md` — full rewrite
- `.github/workflows/ci.yml` — add `--coverage` flag + coverage upload to Codecov (optional)

## Implementation steps
1. **mock-server.ts**:
   - Routes: `/models`, `/providers`, `/chat/completions` (stream + non-stream), `/responses`, `/embeddings`, `/rerank`, `/generation`, `/credits`, `/activity`, `/keys*`, `/guardrails*`, `/organization/members`, `/videos` (POST + status + unsigned_urls), `/auth/keys`, `/models/{a}/{s}/endpoints`
   - Video state machine: after POST → status cycles `pending → in_progress → completed` over 3 polls
   - Controllable latencies + error injection via request headers
2. **E2E harness**: `spawnCli(args, env)` returns `{stdout, stderr, exitCode}`. Base on compiled `bin/openrouter` to catch bundling bugs.
3. **Golden snapshots**: first run writes fixtures; subsequent runs diff. Flag `UPDATE_SNAPSHOTS=1` to regenerate.
4. **docs**:
   - `codebase-summary.md` — hand-authored (or via tiny `scripts/gen-summary.ts`)
   - `code-standards.md` — import order, zod passthrough rule, exit-code rule, CI checks
   - `system-architecture.md` — Mermaid diagram showing main → commands → client → output pipeline
   - `deployment-guide.md` — user (brew/curl/npm) + contributor (tag → release pipeline)
   - `project-roadmap.md` — v1 (shipping), v2 (keychain default + plugin system?), v3 (proxy mode)
5. **README.md** rewrite:
   - Hero + badges
   - Install (3 channels)
   - Quickstart (chat + JSON for agent)
   - Env resolution table (from design-guidelines)
   - Exit codes table
   - Troubleshooting (no key, no mgmt key, SSE hang)
   - Link to `docs/*`
6. **.env.example**: commented vars.
7. Coverage gate: add `bun test --coverage` to CI.

## Todo checklist
- [x] `tests/fixtures/mock-server.ts` + canned responses
- [x] E2E tests (help/chat/video/auth/config)
- [x] Golden snapshots + `UPDATE_SNAPSHOTS=1` flow
- [x] Coverage gate in CI
- [x] `docs/codebase-summary.md`
- [x] `docs/code-standards.md`
- [x] `docs/system-architecture.md`
- [x] `docs/deployment-guide.md`
- [x] `docs/project-roadmap.md`
- [x] `README.md` rewrite
- [x] `.env.example`

## Completion notes
Phase 12 — 446 tests (406 unit + 21 E2E always-on + 19 gated). Full test suite, 5 new docs + README rewrite. main.ts uses runCommand for proper exit-code mapping.

## Success criteria
- `bun test` green on macOS + Linux CI
- Coverage ≥70% lines
- Every `--help` output snapshotted + stable
- `README` quickstart runnable copy-paste
- All docs ≤800 lines and cross-linked
- Contributor can go from `git clone` to `bun run dev -- --help` in under 2 minutes

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Snapshot churn blocks PRs | Isolate snapshots by stable slug; `UPDATE_SNAPSHOTS=1` flow documented |
| Compiled binary flaky across platforms | E2E runs in CI matrix on macOS + Linux |
| Docs drift from code | `codebase-summary.md` regenerated via script; schedule quarterly audit |
| Coverage gate blocks legit PR | Threshold starts at 70% — raise only when tests mature |

## Rollback
Remove `tests/e2e/`, `tests/fixtures/mock-server.ts`, new docs files, revert README.
