# Project Roadmap

## v1 — Current Shipping Scope

**Status: Complete**

All 16 OpenRouter endpoint groups are accessible via the CLI.

### Features
- 16 subcommands: `analytics`, `auth`, `chat`, `completion`, `config`, `credits`, `embeddings`, `generations`, `guardrails`, `keys`, `models`, `org`, `providers`, `rerank`, `responses`, `video`
- Dual output: human pretty-print (TTY) + agent JSON envelope (`--json`) with `schema_version: "1"`
- NDJSON streaming for pipelines (`--output ndjson`)
- OAuth PKCE login flow (`auth login`)
- Manual key management (`auth set-key`, `config set/get/unset`)
- 6-source config cascade (flag → env → dotenv → TOML → keychain → default)
- `config doctor` for debugging resolution
- Shell completion for bash / zsh / fish
- Video async lifecycle: create → poll → download
- Cross-platform single binary (macOS arm64/x64, Linux x64/arm64, Windows x64)
- Exit codes 0/1/2/64-73 for agent consumers
- Deterministic error envelopes
- Homebrew formula + npm package + curl install script

---

## v2 — Ergonomics & Extensibility

**Status: Planned**

Focus: reduce friction for power users and enable third-party integrations.

### Planned Features

- **Keychain by default on first login** — store API key in OS keychain automatically on `auth login` without `--use-keychain` flag
- **Config profile switching** — `--profile prod/staging` maps to separate TOML sections; `config profiles list/use`
- **Plugin API** — load `openrouter-plugin-*.ts` files from `~/.config/openrouter/plugins/`; each plugin can register new subcommands
- **Retry policy customization** — `OPENROUTER_MAX_RETRIES`, `OPENROUTER_RETRY_BACKOFF` env vars
- **Model alias file** — `~/.config/openrouter/aliases.toml` lets users write `--model gpt4` → `openai/gpt-4o`
- **Session history** — optional `~/.config/openrouter/history.ndjson` for audit log of all requests
- **`chat session`** — persistent multi-turn conversation with automatic context management

---

## v3 — Platform Features

**Status: Future**

Focus: infrastructure use cases and enterprise deployments.

### Planned Features

- **Proxy mode** — `openrouter proxy --port 8080` runs a local HTTP proxy that adds auth headers, useful for tools that don't support OpenRouter natively
- **Caching layer** — optional response caching with configurable TTL; respects `Cache-Control` headers from the API
- **Multi-tenant management** — switch between org/API key sets without touching env vars; `openrouter auth switch-org`
- **Rate limiter** — client-side rate limiting to stay under quotas; configurable requests/minute
- **Batch processing** — `chat batch --input prompts.jsonl --output results.jsonl` for high-throughput offline workloads

---

## Non-Goals (v1–v3)

The following are explicitly out of scope to keep the CLI focused:

- **GUI / TUI interactive chat** — use a dedicated chat client; this CLI targets scripts and agents
- **Model fine-tuning management** — not exposed by the OpenRouter API
- **Billing / invoice management** — use the OpenRouter dashboard
- **Multi-provider direct integration** — the CLI wraps OpenRouter only, not individual providers
- **Response caching in v1** — premature optimization; add in v3 when usage patterns are clear
- **Plugin marketplace** — plugins are user-local only; no central registry planned

---

## Milestone Tracking

| Version | Target | Key Blocker |
|---------|--------|-------------|
| v1.0.0 | Q2 2026 | Binary release pipeline |
| v1.1.0 | Q3 2026 | Bug reports from early adopters |
| v2.0.0 | Q4 2026 | Plugin API design finalized |
| v3.0.0 | 2027 | Proxy mode architecture decision |
