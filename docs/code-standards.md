# Code Standards

## TypeScript

- **Target**: `NodeNext` modules, `strict: true`, `allowImportingTsExtensions: true`
- **Runtime**: Bun 1.1.38+ — use Bun globals (`Bun.spawn`, `Bun.serve`, `Bun.file`) over Node equivalents where available
- **No `any`**: Every `any` escape must have an explanatory comment; prefer `unknown` + narrowing

### Import Order (enforced by Biome)

1. `node:*` built-ins
2. External packages (`citty`, `zod`, `@clack/prompts`, …)
3. Internal `src/lib/*` imports
4. Relative imports (`./`, `../`)

Use `.ts` extensions in all import paths (required by `allowImportingTsExtensions`).

### Naming

| Thing | Convention |
|-------|-----------|
| Files | `kebab-case.ts` |
| Classes / Interfaces | `PascalCase` |
| Functions / variables | `camelCase` |
| Constants (module-level, never mutated) | `SCREAMING_SNAKE` |
| Zod schemas | `FooSchema` (PascalCase + `Schema` suffix) |

## Zod Schemas

All schemas that map to OpenRouter API responses **must** use `.passthrough()`. This ensures new API fields flow through unchanged instead of being stripped — critical for long-term agent compatibility.

```ts
// Good
export const ModelSchema = z.object({ id: z.string() }).passthrough();

// Bad — strips unknown fields
export const ModelSchema = z.object({ id: z.string() });
```

## Exit Codes

The CLI uses a stable exit code contract for agent consumers:

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `OK` | Success |
| 1 | `GENERIC` | Unexpected error |
| 2 | `USAGE` | Bad flags / missing args |
| 64 | `NO_KEY` | API key not set |
| 65 | `UNAUTHORIZED` | HTTP 401 |
| 66 | `FORBIDDEN` | HTTP 403 |
| 67 | `NOT_FOUND` | HTTP 404 |
| 68 | `INSUFFICIENT_CREDITS` | HTTP 402 |
| 69 | `RATE_LIMITED` | HTTP 429 |
| 70 | `SERVER_ERROR` | HTTP 5xx |
| 71 | `TIMEOUT` | Request timeout |
| 72 | `INVALID_RESPONSE` | Unexpected API shape |
| 73 | `ASYNC_JOB_FAILED` | Video job failed/cancelled |

Throw `CliError` with the right `ErrorCode`; `main.ts` maps it to `process.exit()`.

## JSON Envelope

Every `--json` response MUST use the stable envelope:

```json
{
  "schema_version": "1",
  "success": true,
  "data": { ... },
  "error": null,
  "meta": { "request_id": "...", "elapsed_ms": 123 }
}
```

Error envelopes set `success: false`, `data: null`, and populate `error`. The `schema_version` field is a string `"1"` — never a number. Do not break this contract.

## File Size Rule

Keep individual code files **under 200 lines**. If a file exceeds this:
1. Extract pure utilities into `src/lib/<domain>/<util-name>.ts`
2. Extract command handlers into separate verb files
3. Split large Zod schema files into domain sub-files

## CI Checks

All of the following must pass before merge:

```bash
bun run typecheck   # tsc --noEmit
bun run lint        # biome check .
bun test            # unit + e2e smoke
bun test --coverage # coverage report (target: ≥70% lines)
bun run build       # bun build --compile (dev bundle check)
```

## Test Patterns

### Unit tests (`tests/unit/`)

- Use `bun:test` (`describe`, `it`, `expect`, `beforeEach`, `afterEach`)
- One `*.test.ts` file per module
- Cover: happy path, key error paths, edge cases
- No network calls — mock or stub external I/O

### E2E tests (`tests/e2e/`)

- Use `startMockServer()` from `tests/fixtures/mock-server.ts`
- Spawn CLI via `spawnCli()` from `tests/e2e/harness.ts`
- Gate slow tests with `describe.skipIf(!process.env.E2E)`
- Always-on smoke tests: `--help` exits 0, missing args exits non-zero

### Golden snapshots

- Stored in `tests/fixtures/golden/*.txt`
- Regenerate: `UPDATE_SNAPSHOTS=1 bun test tests/e2e/help.test.ts`
- CI verifies snapshots are stable (no `UPDATE_SNAPSHOTS` in CI)

## Error Handling

- Every `async` function that calls network or I/O must have explicit `try/catch`
- HTTP errors propagate as `HTTPError` from `src/lib/client/errors.ts`
- Business logic errors propagate as `CliError` from `src/lib/errors/exit-codes.ts`
- Never swallow errors silently — log to stderr at minimum
- Use `cause` parameter on `CliError` for chaining

## Management Key Endpoints

Commands that require the management key (credits, keys, guardrails, org, analytics) MUST:
1. Resolve the key via `resolveManagementKey()`
2. Throw `CliError('no_key', ..., hint)` with a helpful hint if absent
3. Document in command's `meta.description` that a management key is required
