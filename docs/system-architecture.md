# System Architecture

## Request Lifecycle

```mermaid
graph TD
    A[main.ts<br/>runCommand] --> B{args.json?}
    B -->|yes| C[OutputMode: json]
    B -->|no| D[OutputMode: pretty/ndjson]
    A --> E[commands/chat.ts<br/>commands/video.ts<br/>commands/models.ts<br/>…]
    E --> F[lib/config/resolve.ts<br/>6-source cascade]
    F --> G[lib/client/client.ts<br/>fetch + retry + timeout]
    G --> H[OpenRouter API]
    H --> I[lib/output/renderer.ts]
    I -->|json| J[stdout: JSON envelope]
    I -->|pretty| K[stdout: formatted text]
    I -->|ndjson| L[stdout: NDJSON lines]
    G -->|error| M[HTTPError / CliError]
    M --> N[main.ts error handler<br/>process.exit 64-73]
```

## Config Resolution Cascade

Every config value is resolved from 6 sources in priority order (highest first):

```mermaid
graph LR
    F1[1. CLI Flag<br/>--api-key] --> R[Resolved Value]
    F2[2. Env Var<br/>OPENROUTER_API_KEY] --> R
    F3[3. .env file<br/>dotenv cascade] --> R
    F4[4. TOML config<br/>~/.config/openrouter.toml] --> R
    F5[5. OS Keychain<br/>napi-rs/keyring] --> R
    F6[6. Default<br/>hardcoded fallback] --> R
```

Source chain implemented in `src/lib/config/resolve.ts`. Each resolver returns `{ value, source }` for traceability — `openrouter config doctor` displays all sources.

**Default config file location**: `$XDG_CONFIG_HOME/openrouter/config.toml` (or `~/.config/openrouter/config.toml`). Override with `OPENROUTER_CONFIG` env var or `--config` flag.

## Video Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: POST /videos
    pending --> in_progress: server picks up job
    in_progress --> completed: video rendered
    in_progress --> failed: render error
    in_progress --> cancelled: user cancels
    completed --> [*]: download unsigned_urls
    failed --> [*]: exit 73
    cancelled --> [*]: exit 73

    note right of pending
        CLI polls GET /videos/{id}/status
        at configurable interval (default: 5s)
        Emits NDJSON ticks in --ndjson mode
        SIGINT detaches (job keeps running)
    end note
```

## Module Boundaries

```
src/
├── main.ts              ← entry, error handler, no business logic
├── commands/            ← one file per noun; no direct HTTP calls
│   └── *.ts               (delegates to lib/client)
└── lib/
    ├── auth/            ← key masking + persistence only
    ├── cache/           ← in-process TTL cache
    ├── chat/            ← request builder + SSE stream handler
    ├── client/          ← HTTP fetch, retry, headers (NO config logic)
    ├── config/          ← resolution cascade + TOML r/w (NO HTTP)
    ├── errors/          ← exit codes + CliError class
    ├── io/              ← stdin reader, duration parser
    ├── oauth/           ← PKCE, loopback server, browser opener
    ├── output/          ← envelope, renderer, table, TTY detect
    ├── tui/             ← interactive prompts (clack)
    ├── types/           ← zod schemas (no side effects)
    ├── ui/              ← spinner, progress bar
    └── video/           ← request builder, poll loop, file download
```

**Dependency rules** (enforced by convention, not tooling):
- `commands/*` may import from `lib/*` but never from other commands
- `lib/client` has NO imports from `lib/config` (config is injected at call sites)
- `lib/types` has NO imports from anything (pure zod schemas)
- `lib/output` has NO imports from `lib/client` (pure formatting)

## Output Formats

| Format | stdout content | When to use |
|--------|---------------|-------------|
| `pretty` | Human-readable text (default on TTY) | Interactive terminal |
| `json` | Full JSON envelope, pretty-printed | Agents, scripting (`--json`) |
| `ndjson` | One JSON object per line | Streaming agents, log pipelines |
| `table` | ASCII table via cli-table3 | List commands with `--output table` |
| `text` | Plain text, no decoration | Machine-readable single values |

All formats wrap data in `schema_version: "1"` envelope for json/ndjson.

### JSON Envelope Structure

**Standard envelope** (most commands):
```json
{
  "schema_version": "1",
  "data": { /* command-specific data */ },
  "meta": { "ok": true, "execution_time_ms": 123 }
}
```

**Config doctor envelope** (fixed 2026-04-18):
```json
{
  "schema_version": "1",
  "data": [
    { "name": "api_key", "source": "keychain", "value": "sk-or-v1-****abcd", "valid": true },
    { "name": "base_url", "source": "default", "value": "https://openrouter.ai/api", "valid": true }
  ],
  "meta": {
    "ok": true,
    "execution_time_ms": 42,
    "config_file": { "exists": true, "path": "/home/user/.config/openrouter.toml" },
    "keychain": { "available": true }
  }
}
```

Consumers must use `envelope.data.find(r => r.name === 'api_key')` and `envelope.meta.config_file`/`envelope.meta.keychain` — NOT `envelope.data.config_file`.

## Binary Build

```
bun build src/main.ts --compile --minify --outfile bin/openrouter
```

Produces a single self-contained binary (no Node/Bun runtime needed at runtime). Targets: macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64 — built via `scripts/build-binaries.ts`.
