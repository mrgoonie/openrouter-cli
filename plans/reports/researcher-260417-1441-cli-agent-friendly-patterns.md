# CLI Agent-Friendly Patterns Research Report
**Date:** 2026-04-17 | **Scope:** OpenRouter Video CLI design  
**Sources:** clig.dev, GitHub gh CLI, Vercel CLI, OpenAI CLI, Kraken CLI (2025–2026 standards)

---

## Executive Summary
AI-agent-friendly CLIs require machine-readable output as table stakes, but human-friendly CLIs need rich formatting, interactive prompts (only on TTY), and helpful error messages. The winning pattern: **defaults optimized for humans, opt-in JSON for agents, TTY detection for smart behavior**.

---

## 1. AGENT-FRIENDLY CONVENTIONS (Programmatic Invocation)

### Machine-Readable Output
- **Primary:** `--json` or `--format json` flag on ALL commands that return data
- **Format:** Structured JSON (object/array) or NDJSON (streaming). Schema must be self-documenting
- **Why:** Agents parse JSON deterministically; defeats hallucination about output structure
- **Implementation:** Return `{success: bool, data: T, error?: string, exit_code: int}` at top level

### Stderr/Stdout Separation
- **stdout:** Machine-readable results only (JSON when `--json`, final data when human mode)
- **stderr:** Progress, warnings, debug info, human-guidance text
- **Why:** Allows clean piping (`cli command --json | jq .data > results.json`) without pollution

### Exit Codes
- **0:** Success
- **1:** Generic error
- **2:** Invalid usage (args, flags)
- **Specific codes (65+):** Rate limit, auth failure, resource not found (document all)
- **Why:** Agents check exit codes for retry/escalation logic

### Non-Interactive Mode Detection
Detect piped stdin or set via `--non-interactive` / `CI=1` env var:
- Skip interactive prompts entirely
- Replace spinners with deterministic log lines
- Return structured errors instead of dialogues
- **Example:** Vercel CLI shifts to JSON payload mode when non-interactive

### Help Output Stability
- `--help` output must be deterministic (no timestamps, no random examples)
- Structure: usage → description → options → examples
- **Why:** Agents parse help to discover subcommands and flags at runtime

### Color & TTY Detection
```bash
if [ -t 1 ]; then  # stdout is TTY
  USE_COLOR=true
else
  USE_COLOR=false  # CI, pipes, redirects
fi
```
- Use `NO_COLOR` env var (standard) to disable unconditionally
- Never force color in non-TTY context
- **Why:** Avoids ANSI escape sequences in machine-readable outputs

---

## 2. HUMAN-FRIENDLY CONVENTIONS

### Rich Output (When TTY)
- Colored status messages, progress spinners, table formatting
- Use libraries: `chalk` (Node), `rich` (Python), `tui` (Rust)
- Only enable when stdout is TTY + no `--json` flag

### Interactive Prompts
- Only prompt when stdin is TTY (use `--non-interactive` to fail gracefully)
- Provide sensible defaults or suggest answers
- Example: `Enter API key [from OPENROUTER_API_KEY]:` shows fallback source

### Error Messages with Hints
- **What:** What failed
- **Why:** Reason for failure (missing auth, rate limit, network error)
- **How:** Actionable next step (e.g., "Run `openrouter config set api-key <key>`")
- Place critical info at message end (where eyes settle)

### Pager Integration
- Use `$PAGER` (less, more) for output >terminal height
- Example: `openrouter chat list --help | $PAGER` (if output > 30 lines)

---

## 3. COMMAND STRUCTURE (~15 endpoint groups)

### Noun-Verb Pattern (Recommended)
```
openrouter <noun> <verb> [args]
- openrouter chat send <message>      # Chat API
- openrouter models list               # Models listing
- openrouter models info <model-id>    # Model details
- openrouter auth login                # Authentication
- openrouter config set <key> <val>    # Configuration
- openrouter video upload <file>       # Video endpoints
```

**Rationale:**
- Groups commands logically; easy for agents to discover via `--help`
- Mirrors git (`git commit`), Docker (`docker container ls`)
- Natural tree-search for exploration: `openrouter <tab>` → `openrouter chat <tab>`

### Global Flags vs Per-Command Flags
- **Global:** `--json`, `--verbose`, `--config`, `--api-key` (apply to all commands)
- **Per-command:** `--max-tokens` (chat-specific), `--force` (delete-specific)
- Define globals once, inherit everywhere
- **Implementation:** CLI framework (oclif, Cobra, Click) handles inheritance

### Avoid Ambiguity
- Don't create `update` and `upgrade` (confusing)
- Use explicit names: `--max-completion-tokens` not `--max-tokens` (potential overload)

---

## 4. STREAMING EXPOSURE

### SSE for Chat (Asymmetric)
- HTTP endpoint `/chat/stream` returns `Content-Type: text/event-stream`
- Each message: `event: <type>\ndata: {json}\n\n`
- **Event types:** `progress`, `token` (partial), `result` (final)
- **Agent handling:** Parse each line, detect `event: result` to stop reading
- **Why:** Low-latency, no polling; connection stays open during generation

### Polling for Video (Async Jobs)
- Video processing is long-lived (seconds to minutes)
- Return `{job_id: string, status: "processing"|"done"|"failed"}` on POST
- Agents poll: `GET /video/jobs/<id>` until status=done or max-retries
- **Exponential backoff:** 100ms, 200ms, 400ms... capped at 5s between polls
- **Why:** Simpler than SSE, survives process restarts, composes with queue workers

### Hybrid Pattern (Recommended)
- CLI streams SSE for chat (real-time in terminal)
- CLI polls for video uploads (background job tracking)
- Internal SDK abstracts both; agents see unified async API

---

## 5. CONFIGURATION LAYERING

### Precedence (Highest to Lowest)
1. Command-line flags (`--api-key abc`, `--model gpt-4`)
2. Environment variables (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`)
3. `.env.local` (machine-specific, gitignored)
4. `.env.{NODE_ENV}.local` (e.g., `.env.development.local`)
5. `.env.{NODE_ENV}` (e.g., `.env.development`)
6. `.env` (shared defaults, safe to commit)
7. Config file (`~/.openrouter/config.json`)
8. Hardcoded defaults

### Dotenv Best Practices
- Load in order: `.env` → `.env.{NODE_ENV}` → `.env.local` → `.env.{NODE_ENV}.local`
- Only `.local` files override previous values; rest merge
- Example `.env`:
  ```
  OPENROUTER_API_URL=https://openrouter.ai/api/v1
  OPENROUTER_MODEL=gpt-4
  ```
- Example `.env.local` (gitignored):
  ```
  OPENROUTER_API_KEY=sk-...
  ```

### Secrets Management
- **Never commit `.local` files or secrets**
- For agents in CI: use OS keychain (macOS), `1Password CLI` (teams), or `Phase` (managed)
- **Agent-safe pattern:** Proxy injects keys at transport layer; agent never sees raw value
- CLI reads from keychain transparently: `security find-generic-password -s openrouter_api_key` (macOS)

---

## 6. CONCRETE RECOMMENDATIONS

### Architecture Decision
```
For 15 endpoint groups + streaming + 2-3 million agents:
├── Framework: oclif (TypeScript) or Cobra (Go)
│   Rationale: Built-in plugin/command generation, TTY detection, arg parsing
├── Output: --json always available, --verbose for debug
├── Stream: Chat = SSE, Video = polling (with --watch flag for tail-like behavior)
└── Config: flags > env > .env.* > ~/.openrouter/config
```

### Must-Have Flags (All Commands)
- `--json` — machine-readable output
- `--verbose` / `-v` — debug logging to stderr
- `--help` / `-h` — stable, parseable help
- `--version` — semantic version (for upgrade checks)

### Streaming Implementation
- **Chat:** Use Node `EventSource` (polyfill) or fetch with `ReadableStream`
- **Video:** Implement `--watch` flag: `openrouter video upload --watch <file>` polls every 2s
- **Error recovery:** On disconnect, resume from `event.id` (SSE) or last-seen `job_id`

### Configuration File Location
- `~/.openrouter/config.json` (user-level, shared across projects)
- `./openrouter.json` (project-level, safe to commit non-secret config)
- Flag override: `--config /custom/path` for CI/automation

---

## 7. ADOPTION RISK & MATURITY

| Risk | Mitigation |
|------|-----------|
| **Breaking changes in JSON schema** | Version schema (`{schema_version: "1.0"}`); deprecate fields for 2 releases before removal |
| **Agent assumptions about TTY** | Document `--non-interactive` prominently; default to no-TTY in CI |
| **Streaming flakiness (SSE)** | Provide fallback HTTP polling endpoint; document reconnection logic |
| **Config precedence confusion** | Print resolved config on `--verbose`: `[DEBUG] Config sources: env OPENROUTER_API_KEY > .env.local` |

---

## UNRESOLVED QUESTIONS

1. **Video upload resumption:** Should failed uploads retry at the CLI level, or delegate to agent?  
   *Impact:* Affects `--watch` flag behavior and error reporting granularity
2. **Streaming format for video polling:** JSON Lines (NDJSON) for job status updates, or simple JSON?  
   *Impact:* Agent parsing complexity; NDJSON is more agent-friendly for streaming polls
3. **OpenRouter API stability:** Does OpenRouter publish a CLI-focused API changelog?  
   *Impact:* Schema versioning strategy
4. **Auth token lifetime:** How long are tokens valid? Should CLI refresh automatically?  
   *Impact:* User experience for long-running jobs (e.g., `--watch` on 10-minute video)

---

## SOURCES

- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/) — Foundational modern CLI UX principles
- [GitHub gh CLI Architecture](https://github.com/cli/cli) — Noun-verb patterns, subcommand discovery
- [Vercel CLI JSON Output](https://vercel.com/docs/cli) — Agent-mode and structured outputs
- [OpenAI Codex CLI Patterns](https://developers.openai.com/codex/cli) — Streaming and event processing modes
- [Kraken CLI for AI Agents (2026)](https://blog.kraken.com/news/industry-news/announcing-the-kraken-cli) — 10–32x token efficiency vs MCP
- [Streaming with SSE for Agents](https://langwatch.ai/scenario/examples/testing-remote-agents/sse/) — Agent-driven SSE patterns
- [dotenv Precedence (Vite, Vue, Rails)](https://vite.dev/guide/env-and-mode) — Configuration layering standards
