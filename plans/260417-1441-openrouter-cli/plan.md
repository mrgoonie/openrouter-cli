---
title: "OpenRouter CLI — Bun/TS wrapping all 16 endpoint groups"
description: "Agent + human CLI for the full OpenRouter API with streaming, async video, OAuth PKCE, and cross-platform binaries."
status: pending
priority: P2
effort: ~12 days
branch: main
tags: [cli, bun, typescript, openrouter]
created: 2026-04-17
---

# OpenRouter CLI — Bun/TS wrapping all 16 endpoint groups

## Goal

Single binary `openrouter` that maps every OpenRouter endpoint group to a noun-verb subcommand. Same commands serve humans (pretty/TTY) and agents (`--json`/NDJSON, stable schema, deterministic exit codes). Stack and surface already decided — see docs below.

## Stack (one line)

Bun 1.1+ · TypeScript strict · citty · c12 · @napi-rs/keyring · @clack/prompts · zod · eventsource-parser · biome · `bun build --compile` single binary.

## Docs (authoritative)

- `docs/tech-stack.md` — dependency list + directory layout + build targets
- `docs/design-guidelines.md` — command tree, global flags, JSON envelope, exit codes, OAuth flow, TOML config
- `docs/project-overview-pdr.md` — success metrics, risks

## Research reports

- `plans/reports/researcher-260417-1442-openrouter-api-reference.md` — all 16 endpoints (paths/auth/params/responses)
- `plans/reports/researcher-260417-1441-cli-agent-friendly-patterns.md` — NDJSON/SSE/non-interactive
- `plans/reports/researcher-260417-1441-api-key-resolution.md` — dotenv cascade

## Phases

| # | Name | Depends on | Unblocks | Status |
|---|---|---|---|---|
| 1 | [Scaffold tooling](./phase-01-scaffold-tooling.md) | — | 2 | ✅ |
| 2 | [Core HTTP + output lib](./phase-02-core-http-output-lib.md) | 1 | 3,5,6,7,8,9 | ✅ |
| 3 | [Config resolution cascade](./phase-03-config-resolution-cascade.md) | 2 | 4,5–9,10 | ✅ |
| 4 | [Auth + OAuth PKCE](./phase-04-auth-oauth-pkce.md) | 3 | 5–9 | ✅ |
| 5 | [Chat + Responses + TUI picker](./phase-05-chat-responses-streaming.md) | 2,3,4 | 12 | ✅ |
| 6 | [Models/Providers/Generations/Credits](./phase-06-models-providers-generations-credits.md) | 2,3,4 | 12 | ✅ |
| 7 | [Embeddings + Rerank](./phase-07-embeddings-rerank.md) | 2,3,4 | 12 | ✅ |
| 8 | [Video async generation](./phase-08-video-async-generation.md) | 2,3,4 | 12 | ✅ |
| 9 | [Management (keys/guardrails/org/analytics)](./phase-09-management-endpoints-keys-guardrails-org-analytics.md) | 2,3,4 | 12 | ✅ |
| 10 | [Shell completion + `config`](./phase-10-shell-completion-config-command.md) | 3 | 12 | ✅ |
| 11 | [Cross-platform build + release](./phase-11-cross-platform-build-release.md) | 1 (parallel w/ 2–10) | 12 | ✅ |
| 12 | [Tests + docs polish](./phase-12-tests-docs-polish.md) | 1–11 | — | ✅ |

## Success metrics (from PDR)

- Cold start <10 ms · binary <15 MB stripped · `chat send` p50 <500 ms excl. model
- All 16 endpoint groups reachable · stable JSON envelope (`schema_version: "1"`)
- Agent invocation success rate >99% (excluding upstream errors)

## Cross-phase rules

- Never break JSON envelope once shipped (`schema_version: "1"`)
- Pass unknown API fields through unchanged (schema drift resilience)
- Management-key endpoints must error with fix-hint when missing
- Destructive ops require TTY prompt OR `--force` OR `--non-interactive`

## Changelog

- 2026-04-17: all 12 phases shipped. CLI ready for release (v0.0.0 → tag v0.1.0 next).
