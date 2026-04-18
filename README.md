# openrouter

> The all-in-one CLI for the OpenRouter API — agent-friendly by default.

![Bun](https://img.shields.io/badge/runtime-Bun%20%E2%89%A51.1.38-black)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-446%20passing-brightgreen)

---

## Quickstart

```bash
# 1. Install
brew install openrouter/tap/openrouter

# 2. Authenticate
openrouter auth set-key sk-or-v1-...

# 3. Chat
openrouter chat send "What is the capital of France?" --model openai/gpt-4o
```

**For agents — machine-readable JSON:**

```bash
openrouter chat send "Summarize this" --model openai/gpt-4o --json --no-stream \
  <<< "$(cat document.txt)"
# stdout: { "schema_version": "1", "success": true, "data": { ... } }
```

---

## Install

### Homebrew (macOS / Linux)

```bash
brew install openrouter/tap/openrouter
```

### Curl script

```bash
curl -fsSL https://raw.githubusercontent.com/user/openrouter-cli/main/install.sh | sh
```

### npm

```bash
npm install -g openrouter-cli
```

### From source (requires Bun ≥ 1.1.38)

```bash
git clone https://github.com/user/openrouter-cli
cd openrouter-cli
bun install
bun run build        # outputs bin/openrouter
./bin/openrouter --help

# Or run without building:
bun run dev -- --help
```

---

## Configuration

The CLI resolves every config value from 6 sources in priority order:

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | CLI flag | `--api-key sk-or-v1-...` |
| 2 | Environment variable | `OPENROUTER_API_KEY=sk-or-v1-...` |
| 3 | `.env` file (dotenv cascade) | `.env` in cwd or parents |
| 4 | TOML config file | `~/.config/openrouter/config.toml` |
| 5 | OS keychain | `openrouter auth login` |
| 6 (lowest) | Built-in default | `https://openrouter.ai/api/v1` |

**Debug your config:**

```bash
openrouter config doctor --json
```

**Set values:**

```bash
openrouter config set defaults.model openai/gpt-4o
openrouter config get defaults.model
openrouter config path   # print config file location
```

See `.env.example` for all recognized environment variables.

---

## Commands

| Command | Description |
|---------|-------------|
| `analytics show` | Usage analytics by endpoint |
| `auth login` | OAuth PKCE flow — stores key automatically |
| `auth set-key <key>` | Manually store an API key |
| `auth status` | Show resolved config + sources |
| `auth whoami` | Verify credentials with a live API call |
| `chat send <msg>` | Streaming chat completions |
| `completion` | Shell completion (bash/zsh/fish) |
| `config doctor` | Diagnose config resolution |
| `config get/set/unset` | Read and write TOML config values |
| `credits show` | Account credit balance |
| `embeddings create` | Text embeddings |
| `generations get` | Generation metadata by ID |
| `guardrails list/create/…` | Manage content guardrails |
| `keys list/create/…` | Manage API sub-keys |
| `models list` | Browse available models |
| `org members` | Organization member list |
| `providers list` | Provider status |
| `rerank create` | Rerank documents by relevance |
| `responses create` | Responses API (beta) |
| `video create/status/wait/download` | Async AI video generation |

---

## Agent Mode

The CLI is designed to be called from scripts and AI agents.

### JSON output

Every command supports `--json` for a stable envelope:

```json
{
  "schema_version": "1",
  "success": true,
  "data": { ... },
  "error": null,
  "meta": { "request_id": "gen-...", "elapsed_ms": 312 }
}
```

Error envelope:

```json
{
  "schema_version": "1",
  "success": false,
  "data": null,
  "error": { "code": "unauthorized", "message": "Invalid API key", "status": 401 },
  "meta": {}
}
```

### NDJSON streaming

```bash
openrouter chat send "Write a haiku" --model openai/gpt-4o --output ndjson
# → one JSON object per line, tokens streamed as they arrive
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Unexpected error |
| 2 | Bad flags / missing args |
| 64 | API key not set |
| 65 | Unauthorized (HTTP 401) |
| 66 | Forbidden (HTTP 403) |
| 67 | Not found (HTTP 404) |
| 68 | Insufficient credits (HTTP 402) |
| 69 | Rate limited (HTTP 429) |
| 70 | Server error (HTTP 5xx) |
| 71 | Request timeout |
| 72 | Unexpected API response shape |
| 73 | Async video job failed / cancelled |

Check `$?` after every call. Exit codes are stable across patch versions.

---

## Troubleshooting

**No API key → exit 64**

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
# or:
openrouter auth set-key sk-or-v1-...
```

**Management key required → exit 64**

Commands like `credits show`, `keys list`, `guardrails list` need a separate management key:

```bash
export OPENROUTER_MANAGEMENT_KEY=sk-or-v1-...
# or:
openrouter auth set-key sk-or-v1-... --management
```

**Rate limited → exit 69**

The client retries automatically (up to 3 times with exponential backoff). If still hitting limits, reduce request frequency or add `--timeout` headroom.

**SSE stream hangs**

Add `--no-stream` to get a single blocking response instead:

```bash
openrouter chat send "hi" --model openai/gpt-4o --no-stream --json
```

**Inspect full config resolution**

```bash
openrouter config doctor
```

---

## Docs

- [Project Overview & PDR](docs/project-overview-pdr.md) — vision, target users, success metrics
- [Design Guidelines](docs/design-guidelines.md) — command structure, output formats, agent contracts, OAuth flow
- [Tech Stack](docs/tech-stack.md) — Bun, Citty, libraries, build + release pipeline
- [Codebase Summary](docs/codebase-summary.md) — file-by-file purpose table
- [Code Standards](docs/code-standards.md) — TypeScript conventions, test patterns, exit codes
- [System Architecture](docs/system-architecture.md) — request lifecycle, config cascade, video state machine
- [Deployment Guide](docs/deployment-guide.md) — install channels + contributor release flow
- [Project Roadmap](docs/project-roadmap.md) — v1 (shipped) → v2 → v3 milestones

---

## Contributing

1. `git clone` + `bun install`
2. `bun run dev -- --help` — verify CLI starts
3. `bun run test` — unit tests (no network)
4. `bun run test:integration` — real-API tests (requires `.env` with `OPENROUTER_API_KEY` and/or `OPENROUTER_MANAGEMENT_KEY`; per-suite auto-skip if a key is missing)
5. `bun run lint && bun run typecheck` — must be clean
6. Read [Code Standards](docs/code-standards.md) before submitting a PR

### Integration tests

Integration tests spawn the compiled CLI and hit the real OpenRouter API. They use free / cheap models (`meta-llama/llama-3.2-1b-instruct:free`, `google/gemini-2.0-flash-lite-001`, `openai/text-embedding-3-small`) to keep cost negligible.

- Locally: put keys in `.env`, then `bun run test:integration`.
- CI: configure `OPENROUTER_API_KEY` and `OPENROUTER_MANAGEMENT_KEY` as repo secrets. The `Integration Tests` workflow runs on `push` to `main` and via `workflow_dispatch`.

---

## License

MIT © 2026
