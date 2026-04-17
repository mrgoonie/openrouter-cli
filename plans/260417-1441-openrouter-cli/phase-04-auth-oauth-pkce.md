---
phase: 4
title: "Auth + OAuth PKCE"
status: completed
effort: "1d"
---

# Phase 04 — Auth + OAuth PKCE

## Context
- Docs: `docs/design-guidelines.md` §9 (PKCE flow); `docs/tech-stack.md` (Bun.serve loopback)
- Reports: `plans/reports/researcher-260417-1442-openrouter-api-reference.md` §11 (OAuth endpoints)
- Depends on: phase-03 (resolver + config file + keychain)
- Unblocks: phase-05–09 (all API calls need a key)

## Goal
`openrouter auth login` runs the OpenRouter PKCE flow end-to-end: open browser, receive callback on loopback, exchange `code` for an API key, persist to config (or keychain), print masked result. Sibling verbs cover logout, status, whoami, and manual set-key.

## Requirements
### Functional
- `openrouter auth login [--port N] [--no-browser] [--use-keychain]`:
  1. Generate 64-char `code_verifier`
  2. `code_challenge = base64url(sha256(code_verifier))`
  3. Bind loopback listener on first free port in 8976..8999; collect `code` from query
  4. Open `https://openrouter.ai/auth?callback_url=http://localhost:<port>&code_challenge=<c>&code_challenge_method=S256`
  5. `POST https://openrouter.ai/api/v1/auth/keys` body `{code, code_verifier, code_challenge_method: "S256"}`
  6. Persist returned `data.id` as API key to config file (default) or keychain (if `--use-keychain` or config opt-in)
  7. Print: `✓ Logged in as <masked key> (expires: <created_at>)`
- `openrouter auth logout`: delete API key from config AND keychain; best-effort; confirm on TTY
- `openrouter auth status`: print each resolved var + source; no secrets printed raw, only masked last-4
- `openrouter auth whoami`: lightweight authed call (e.g. `GET /credits` with mgmt key, fallback `GET /models` with user key) — prints account identity if available
- `openrouter auth set-key <key> [--management] [--use-keychain]`: writes without OAuth; useful for CI

### Non-functional
- Non-TTY fallback: print full auth URL to stdout and prompt user to paste callback URL with `code` param via stdin
- SIGINT during login tears down server cleanly
- Never log full keys; mask to `sk-or-v1-…XXXX`
- Support `--no-browser` for WSL/SSH scenarios (prints URL only)

## Files to create
- `src/lib/oauth/pkce.ts` — `generateCodeVerifier()` (64 char random URL-safe), `codeChallenge(verifier)` → base64url(sha256), uses `crypto.subtle` (≤50 lines)
- `src/lib/oauth/loopback-server.ts` — `startLoopback({preferredPort?}): Promise<{port, waitForCode(timeoutMs): Promise<string>, stop()}>`; uses `Bun.serve`; tries ports 8976→8999; returns tiny success HTML on callback (≤100 lines)
- `src/lib/oauth/open-browser.ts` — cross-platform `openBrowser(url)`: `open` macOS, `xdg-open` Linux, `start` Windows (≤40 lines)
- `src/lib/auth/mask-key.ts` — `maskKey(key): string` keep prefix `sk-or-v1-` + last 4 (≤20 lines)
- `src/lib/auth/persist-key.ts` — `persistKey(value, {useKeychain, kind:'api'|'management'})`, `clearKey({kind})`, `loadPersistedKey({kind}): {value, source}|null` (≤80 lines)
- `src/commands/auth.ts` — citty sub-router with verbs: `login`, `logout`, `status`, `whoami`, `set-key` (≤200 lines)

## Files to modify
- `src/main.ts` — register `auth` subcommand group

## Implementation steps
1. **pkce.ts**:
   - `generateCodeVerifier()`: 48 bytes from `crypto.getRandomValues` → base64url → trim padding → 64 chars
   - `codeChallenge(v)`: `await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))` → base64url
2. **loopback-server.ts**:
   - Try `Bun.serve({port, fetch})` in a loop over 8976..8999 catching `EADDRINUSE`
   - Handler: parse `url.searchParams.get('code')`; resolve waiting promise; respond `<html>...success...</html>`
   - Reject on 2-minute timeout or SIGINT
3. **open-browser.ts**: `spawn('open'|'xdg-open'|'start', [url])`. Detect platform via `process.platform`. Swallow errors — user can still copy URL from stdout.
4. **mask-key.ts**: if key length <12 → return `***` else keep first 10 + '…' + last 4.
5. **persist-key.ts**:
   - `persistKey(value, {useKeychain, kind})`: if useKeychain → `setKeychainValue(kind==='management' ? 'management_key' : 'api_key', value)`; else write to config `[auth]` section via `writeConfigFile`
   - `loadPersistedKey`: first try keychain (if opt-in), then config
6. **commands/auth.ts** — six verbs:
   - `login`:
     - `verifier = generateCodeVerifier()`; `challenge = await codeChallenge(verifier)`
     - `server = await startLoopback({preferredPort: opts.port})`
     - URL built; `openBrowser(url)` unless `--no-browser`
     - If non-TTY: print URL + read callback URL from stdin
     - `code = await server.waitForCode(120_000)`
     - POST `/auth/keys` with body, using `client.request` (no Authorization header)
     - `persistKey(data.id, {useKeychain, kind:'api'})`
     - Render success
   - `logout`: confirm on TTY (unless `--force` or non-interactive); `clearKey({kind:'api'})` + `clearKey({kind:'management'})`
   - `status`: resolve each var, print table `{name, source, masked}`
   - `whoami`: `client.request({path: '/credits', auth: 'mgmt'})` — if 401, fall back to `/models` with user key and report "authenticated (user key)"
   - `set-key`: validate non-empty; `persistKey(...)`
7. Unit tests:
   - `pkce.test.ts`: verifier length, challenge deterministic from fixed verifier
   - `mask-key.test.ts`: masking rules
   - `loopback-server.test.ts`: spin up, hit loopback with fetch, assert code captured
   - `persist-key.test.ts`: round-trip via mocked fs + fake keychain
   - `auth.test.ts`: `status` rendering, `logout` confirmation bypass under `CI=1`

## Todo checklist
- [x] `pkce.ts` verifier + challenge
- [x] `loopback-server.ts` with port scan
- [x] `open-browser.ts` cross-platform
- [x] `mask-key.ts`
- [x] `persist-key.ts` (keychain + config)
- [x] `commands/auth.ts` (five verbs)
- [x] `main.ts` wires `auth`
- [x] Unit tests all green
- [x] Manual smoke: real OAuth round-trip (documented in onboarding)

## Completion notes
Phase 4 — 153 tests. Auth + OAuth PKCE (oauth/pkce.ts, loopback-server.ts, open-browser.ts, auth/mask-key.ts, persist-key.ts, commands/auth.ts with 5 verbs).

## Success criteria
- `openrouter auth login` returns exit 0 and persists a working key
- Key validates on next `openrouter models list` (phase-06)
- `logout` removes key from both stores; subsequent `status` shows source `default`
- Non-TTY mode prints URL and accepts pasted callback — round-trips successfully
- SIGINT during login stops server; exits non-zero; nothing persisted

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Port 8976–8999 all busy | Fall back to random ephemeral port; report chosen port in stdout |
| `openBrowser` fails silently | Always print URL before attempting to open |
| OpenRouter changes `/auth/keys` signature | Pin schema version + zod passthrough; document breakage |
| Browser blocks `localhost` HTTP on macOS | Use `127.0.0.1` + ensure `callback_url` uses `http://localhost` exact match |
| Key leaks in CI logs | Never print raw keys; mask aggressively; redact in verbose mode |

## Rollback
Remove `src/commands/auth.ts`, `src/lib/oauth/`, `src/lib/auth/`. No upstream callers yet.
