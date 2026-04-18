# OpenRouter CLI v0.1.0 Shipped

**Date**: 2026-04-17 14:41
**Severity**: Low (shipping, not incident)
**Component**: openrouter-cli (Bun binary, TypeScript strict mode)
**Status**: Resolved

## What Shipped

- 12 phases completed in single `/ck:cook --auto` run with delegated subagents
- 16 endpoint groups wrapped: analytics, auth, chat, completion, config, credits, embeddings, generations, guardrails, keys, models, org, providers, rerank, responses, video
- 446 tests pass (406 unit + 21 E2E + 19 gated behind `E2E=1`)
- Cross-platform binaries: darwin-arm64/x64, linux-arm64/x64, windows-x64 via `bun build --compile`
- JSON envelope contract (`schema_version: "1"`) with NDJSON streaming for chat + video progress
- API key cascade: flag → env → dotenv → TOML → OS keychain
- OAuth PKCE loopback on ports 8976-8999
- Typed exit codes (0, 1, 2, 64-73) for agent consumption
- Biome linting + zod with `.passthrough()` for forward-compat
- GH Actions release pipeline: tag v* → binaries + Homebrew formula + npm wrapper

## Decisions Worth Remembering

**Subagent delegation per phase** — Kept controller context minimal by spawning fresh fullstack-developers for each phase. Trade-off was coordination overhead, but allowed completing all 12 phases without mid-way compaction that would have lost continuity.

**Phase 12 exit-code fix** — citty's `runMain` silently swallows CliError codes. Switched to `runCommand` + try/catch in main.ts to properly wire exit codes 64-73. Would have shipped broken if E2E tests hadn't surfaced it.

**Shell completion as TS exports** — Defined completion templates as TypeScript exports instead of reading from disk. Keeps compiled binary self-contained (no `import.meta.url` hacks). Simpler, but requires regeneration when grammar changes.

**Zod `.passthrough()` everywhere** — Forward-compatible with OpenRouter schema drift. Relaxed validation in exchange for resilience to API evolution. Silent discarding of unknown fields acceptable because agent JSON parsing is tolerant.

**Mock E2E server with state machine** — Video polling test cycles pending→in_progress→completed over 3 ticks using `Bun.serve`. Zero live API hits in test suite. Fragile if OpenRouter changes video polling contract, but acceptable for CI stability.

## What Surprised Me

Exit codes were the real trap. `citty` is intuitive for command parsing but its error handling is opaque — the code passed linting, passed unit tests, failed E2E. The bug only surfaced when tests checked exit codes explicitly, then it was obvious: `runMain` catches exceptions internally and always exits 1. Lesson: test exit codes early, not late.

## Open Questions

- Homebrew formula maintenance: will auto-generated template stay in sync with binary versions?
- API key resolution cascade: what if .git is deeply nested? Does `c12` walk the right distance?
- Binary size creep: starting at ~5 MB stripped. Will @napi-rs/keyring + zod drift keep it under 15 MB?
