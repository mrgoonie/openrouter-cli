# Codebase Summary

A file-by-file reference for the `openrouter` CLI. Generated from source; update after major refactors.

## Entry Point

| File | Purpose |
|------|---------|
| `src/main.ts` | CLI entry — defines the root citty command, wires subcommands, installs top-level error handler that maps `CliError`/`HTTPError` to exit codes 64-73. |
| `src/version.ts` | Single source of truth for the `VERSION` string. |

## src/commands/

One file per noun. Each exports a `defineCommand` that groups verb subcommands.

| File | Subcommands | Auth |
|------|-------------|------|
| `analytics.ts` | `show` | mgmt key |
| `auth.ts` | `login`, `logout`, `status`, `whoami`, `set-key` | none / user |
| `chat.ts` | `send`, `completion` | user key |
| `completion.ts` | shell completion (bash/zsh/fish) | none |
| `config.ts` | `get`, `set`, `unset`, `list`, `path`, `doctor` | none |
| `credits.ts` | `show` | mgmt key |
| `embeddings.ts` | `create` | user key |
| `generations.ts` | `get` | user key |
| `guardrails.ts` | `list`, `create`, `update`, `delete`, `assignments` | mgmt key |
| `keys.ts` | `list`, `create`, `get`, `update`, `delete` | mgmt key |
| `models.ts` | `list`, `get`, `endpoints` | user key |
| `org.ts` | `members` | mgmt key |
| `providers.ts` | `list` | user key |
| `rerank.ts` | `create` | user key |
| `responses.ts` | `create` | user key |
| `video.ts` | `create`, `status`, `wait`, `download` | user key |

## src/lib/auth/

| File | Purpose |
|------|---------|
| `mask-key.ts` | Masks an API key for display (`sk-or-v1-****abcd`). |
| `persist-key.ts` | Reads/writes API keys to TOML config or OS keychain. |

## src/lib/cache/

| File | Purpose |
|------|---------|
| `memory-cache.ts` | Simple TTL-based in-process cache (used by `models list`). |

## src/lib/chat/

| File | Purpose |
|------|---------|
| `build-request.ts` | Assembles `ChatCompletionRequest` from CLI flags. |
| `stream-handler.ts` | Consumes SSE stream, emits tokens in pretty/ndjson/json mode. |

## src/lib/client/

| File | Purpose |
|------|---------|
| `client.ts` | Core HTTP client: auth headers, retry (429/502-504), timeout, response metadata. |
| `errors.ts` | `HTTPError`, `TimeoutError`, `mapStatusToCode`, `extractMessage`. |
| `stream-request.ts` | Variant of client that returns a raw `Response` for SSE streaming. |

## src/lib/config/

| File | Purpose |
|------|---------|
| `file.ts` | Read/write TOML config file via `smol-toml`. |
| `keychain.ts` | `@napi-rs/keyring` availability check; safe fallback when unavailable. |
| `kv-path.ts` | Dot-path get/set/unset helpers for nested TOML objects. |
| `resolve.ts` | 6-source cascade resolution for every config value (flag → env → dotenv → config → keychain → default). |

## src/lib/errors/

| File | Purpose |
|------|---------|
| `exit-codes.ts` | `ExitCode` enum (0/1/2/64-73), `ErrorCode` union, `codeToExit()`, `CliError` class. |

## src/lib/io/

| File | Purpose |
|------|---------|
| `parse-duration.ts` | Parses human durations (`2s`, `5m`, `1h`) to milliseconds. |
| `read-stdin.ts` | Reads all of stdin to a string (used for piped message input). |

## src/lib/oauth/

| File | Purpose |
|------|---------|
| `loopback-server.ts` | Spawns a `Bun.serve` loopback to receive OAuth callback `?code=…`. |
| `open-browser.ts` | Cross-platform browser opener (`open`/`xdg-open`/`start`). |
| `pkce.ts` | PKCE `code_verifier` generator and SHA-256 `code_challenge` computation. |

## src/lib/output/

| File | Purpose |
|------|---------|
| `json.ts` | `envelope()`, `errorEnvelope()`, `emitNdjson()` — stable `schema_version:"1"` contract. |
| `renderer.ts` | `render()` dispatches to pretty/json/ndjson/table/text based on `OutputMode`. |
| `table.ts` | `cli-table3` wrapper for tabular display. |
| `tty.ts` | `resolveOutputMode()`, `isTTY()`, `isNonInteractive()`. |

## src/lib/tui/

| File | Purpose |
|------|---------|
| `model-picker.ts` | Interactive `@clack/prompts` fuzzy picker for model selection. |

## src/lib/types/

| File | Purpose |
|------|---------|
| `config.ts` | Zod schema for the TOML config file structure. |
| `openrouter.ts` | Zod schemas for all OpenRouter API response shapes (passthrough for forward compat). |

## src/lib/ui/

| File | Purpose |
|------|---------|
| `spinner.ts` | TTY spinner wrapper (used during polling). |
| `progress.ts` | Download progress bar. |

## src/lib/video/

| File | Purpose |
|------|---------|
| `build-create-request.ts` | Assembles `VideoCreateRequest` from CLI flags (loads JSON provider file if provided). |
| `download-files.ts` | Downloads `unsigned_urls` to a local directory with progress callbacks. |
| `poll-loop.ts` | Generic `pollJob()` loop with timeout, interval, and `onTick` callback. |

## src/lib/context.ts

Builds the shared `Context` object passed through the CLI: resolved flags, render helpers, `emitError`.

## scripts/

| File | Purpose |
|------|---------|
| `build-binaries.ts` | Cross-compiles for macOS arm64/x64, Linux x64/arm64, Windows x64. |
| `release.ts` | Tags, builds, uploads GitHub release assets, bumps Homebrew formula. |

## tests/

| Path | Purpose |
|------|---------|
| `tests/smoke.test.ts` | Minimal scaffold smoke test. |
| `tests/unit/` | Per-module unit tests (40 files, 406 assertions). |
| `tests/e2e/` | End-to-end subprocess tests via mock server (6 files). |
| `tests/fixtures/mock-server.ts` | `Bun.serve` mock with video state machine and error injection. |
| `tests/fixtures/responses/*.json` | Canned API responses for all endpoints. |
| `tests/fixtures/golden/*.txt` | Snapshot fixtures for `--help` output (written by `UPDATE_SNAPSHOTS=1`). |
