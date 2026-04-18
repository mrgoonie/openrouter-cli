# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] — 2026-04-18

### Added
- Claude Code plugin + `openrouter` skill under `plugins/openrouter/` with marketplace manifest (`.claude-plugin/marketplace.json`). Teaches Claude Code and compatible agents how to drive the CLI with JSON envelopes, stable exit codes, NDJSON streaming, and common chat/embeddings/rerank/video workflows.

## [0.1.0] — 2026-04-17

### Fixed
- URL path-joining bug that stripped `/api/v1` from the base URL (client.ts, stream-request.ts) — rendered all API calls non-functional.
- ProviderSchema field mismatch (`id` → `slug`) matching actual OpenRouter `/providers` payload.
- Banner text leaked after subcommand output (root handler in citty also fires alongside subcommand).
- Unit tests leaked local `.env` values into resolver test state (added `beforeEach delete env` guards).

### Added
- First usable release of `openrouter-cli`. All 16 endpoint groups verified against live OpenRouter API.
