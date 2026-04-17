---
phase: 3
title: "Config resolution cascade"
status: completed
effort: "1d"
---

# Phase 03 — Config resolution cascade

## Context
- Docs: `docs/design-guidelines.md` §3 (precedence), §10 (TOML schema); `docs/tech-stack.md` (c12, dotenv, @napi-rs/keyring)
- Reports: `plans/reports/researcher-260417-1441-api-key-resolution.md` (cascade details)
- Depends on: phase-02 (types/config.ts, error helpers)
- Unblocks: phase-04 (auth needs resolver), phase-05–10 (all commands)

## Goal
Deterministic key/setting resolution: `--flag` > process env > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` (walking upward until `.git`) > TOML config > OS keychain. `config doctor` exposes which source each resolved value came from.

## Requirements
### Functional
- Resolve `OPENROUTER_API_KEY`, `OPENROUTER_MANAGEMENT_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_OUTPUT`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`, `OPENROUTER_TIMEOUT`
- Each resolver returns `{value, source}` where `source ∈ flag|env|.env.*|config|keychain|default`
- Dotenv cascade: walk from CWD upward, stop at `.git` or fs root; per directory load in order `.env` → `.env.<mode>` → `.env.local` → `.env.<mode>.local` (later overrides earlier)
- Mode from `OPENROUTER_ENV`, fallback `NODE_ENV`, fallback `development`
- `${VAR}` expansion inside dotenv values (using already-loaded env)
- Existing `process.env` values always win over dotenv (do not overwrite)
- TOML config at `$XDG_CONFIG_HOME/openrouter/config.toml` (fallback `~/.config/openrouter/config.toml`) — zod-validated
- Keychain opt-in via `auth.use_keychain = true` in config; service name `openrouter`, accounts `api_key`, `management_key`

### Non-functional
- Zero IO when no config file or dotenv present (skip silently)
- Keychain access guarded — if @napi-rs/keyring throws (libsecret missing), log warning to stderr and continue without it
- Pure functions where possible; fs access isolated behind interfaces for testability

## Files to create
- `src/lib/config/resolve.ts` — `resolveString(name, {flag, sources, default?})`; public API: `resolveApiKey(flag?)`, `resolveManagementKey(flag?)`, `resolveBaseUrl(flag?)`, `resolveOutputMode(flag?)`, `resolveTimeout(flag?)`, `resolveHeaders(flag?)`; returns `{value, source}` (≤150 lines)
- `src/lib/config/dotenv-cascade.ts` — `loadDotenvCascade(cwd): Record<string, {value, path}>`; upward search; `${VAR}` expansion; stops at `.git` marker or fs root (≤120 lines)
- `src/lib/config/file.ts` — `readConfigFile()`, `writeConfigFile(patch)`, `configPath()`; uses `smol-toml` for parse, zod schema from phase-02 for validation (≤120 lines)
- `src/lib/config/keychain.ts` — `getKeychainValue(account)`, `setKeychainValue(account, value)`, `deleteKeychainValue(account)`; gracefully no-op if keyring module unavailable (≤80 lines)
- `src/lib/config/mode.ts` — `resolveMode(): 'development'|'production'|'test'|string` (≤30 lines)

## Files to modify
- `src/main.ts` — register global flags (`--api-key`, `--management-key`, `--base-url`, `--output`, `--json`, `--no-color`, `--verbose`, `--quiet`, `--config`, `--timeout`, `--non-interactive`, `--http-referer`, `--app-name`) per design-guidelines §2; flags flow into a context object passed to subcommands

## Implementation steps
1. **mode.ts**: `resolveMode()` reads `process.env.OPENROUTER_ENV ?? process.env.NODE_ENV ?? 'development'`.
2. **dotenv-cascade.ts**:
   - `findRoots(cwd)`: walk upward collecting dirs until `.git` encountered or root; cap at 8 levels.
   - For each root (inside→outside): load files in order `.env` → `.env.<mode>` → `.env.local` → `.env.<mode>.local`.
   - Parse each via `dotenv.parse(fs.readFileSync(...))`.
   - Expand `${VAR}` in values using merged-so-far map.
   - **Never overwrite** a key that already exists in `process.env`.
   - Return merged map with per-key source path.
3. **file.ts**:
   - `configPath()`: `process.env.OPENROUTER_CONFIG ?? path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'openrouter', 'config.toml')`.
   - `readConfigFile()`: if missing, return `{}`; else `smol-toml.parse(...)` → zod validate → return parsed.
   - `writeConfigFile(patch)`: deep-merge patch with existing, ensure dir, `smol-toml.stringify`, write atomically (tmp + rename).
4. **keychain.ts**:
   - Lazy-import `@napi-rs/keyring`; if require fails, all ops become no-ops returning `null`/`false` with one-time stderr warning.
   - Service name `openrouter`; account names `api_key`, `management_key`.
5. **resolve.ts**:
   - `resolveString(name, {flag, dotenvMap, configValue, keychainAccount, default?})`:
     1. `if (flag) return {value: flag, source: 'flag'}`
     2. `if (process.env[name]) return {value: process.env[name], source: 'env'}`
     3. `if (dotenvMap[name]) return {value: dotenvMap[name].value, source: dotenvMap[name].path}`
     4. `if (configValue) return {value: configValue, source: 'config'}`
     5. keychain: if opt-in + account present, `return {value, source: 'keychain'}`
     6. fallback: default
   - Public helpers wrap it with fixed names.
6. **main.ts**: define citty `args` for all 14 global flags; in `run` build a `Context` object: `{resolver, render, verbose, quiet, nonInteractive, ...}`; pass to each subcommand.
7. Unit tests:
   - `dotenv-cascade.test.ts`: temp dir trees, verify precedence + upward walk + `.git` stop + `${VAR}` expansion
   - `resolve.test.ts`: each precedence level, mocked `process.env`
   - `file.test.ts`: round-trip read/write, zod rejection on malformed
   - `keychain.test.ts`: fake module injection for success + failure paths
   - Integration: `config doctor` prints correct source strings (implemented in phase-10; stub here)

## Todo checklist
- [x] `mode.ts` resolver
- [x] `dotenv-cascade.ts` with upward walk + expansion
- [x] `file.ts` TOML read/write + atomic writes
- [x] `keychain.ts` with graceful fallback
- [x] `resolve.ts` precedence engine + 7 public resolvers
- [x] Global flags registered in `main.ts`
- [x] Context plumbing to subcommands
- [x] All unit tests green

## Completion notes
Phase 3 — 115 tests. Config cascade (mode.ts, dotenv-cascade.ts, file.ts, keychain.ts, resolve.ts, context.ts), all 14 global flags wired in main.ts.

## Success criteria
- `resolveApiKey()` returns correct `{value, source}` across all 6 layers in tests
- Upward search stops at `.git` — verified via fixture
- `$OPENROUTER_API_KEY` in shell always beats `.env.local` (process env wins)
- No network calls; no hangs; <50 ms total resolver time on cold start
- Keychain missing → warning once, resolver continues

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Leak keys into verbose logs | Redact any key matching `sk-or-*` pattern in error/log output |
| Monorepo without `.git` marker | Cap upward walk at 8 levels; document behavior |
| Config file corrupted | zod validation → clear error message + path; don't overwrite on partial write |
| Keychain prompts on every invocation (macOS) | Document `always-allow` option; default keychain off |
| `.env` with CRLF on Windows | `dotenv` handles both; add test fixture |

## Rollback
Remove `src/lib/config/`; revert global flags in `main.ts` to empty.
