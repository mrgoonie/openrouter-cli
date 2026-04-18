# Command reference

Full matrix of commands shipped by `@mrgoonie/openrouter-cli`. All commands accept `--json`, `--api-key`, `--base-url`, `--timeout` unless noted.

## Auth

| Command | Purpose | Notes |
|---|---|---|
| `auth login` | OAuth PKCE flow | Stores key in OS keychain |
| `auth set-key <key>` | Manually store key | Add `--management` for management endpoints |
| `auth status` | Show resolved config + sources | Safe in CI (redacts secrets) |
| `auth whoami` | Live API call to verify key | Exits 65 if invalid |

## Chat

```
openrouter chat send <message>
  --model <slug>           required (or set defaults.model)
  --system <text>          system prompt
  --temperature <float>
  --max-tokens <int>
  --no-stream              blocking single response
  --output json|ndjson|text (default: streaming text)
  --json                   shortcut for --output json + --no-stream
  --timeout <ms>
```

Input message: positional arg OR stdin (heredoc / pipe).

## Embeddings / Rerank

```
openrouter embeddings create <text...> --model <slug> [--json]
openrouter rerank create --query <q> --documents <d>... --model <slug> [--json]
```

## Models / Providers / Analytics

```
openrouter models list [--json]
openrouter providers list [--json]
openrouter analytics show [--json] [--from <date>] [--to <date>]
```

## Credits / Keys / Guardrails / Org (management key required)

```
openrouter credits show --json
openrouter keys list|create|revoke|update ... --json
openrouter guardrails list|create|delete ... --json
openrouter org members --json
```

Missing management key → exit 64. Use `auth set-key <key> --management`.

## Generations

```
openrouter generations get <id> --json
```

Fetch metadata for a completed generation by `request_id` (from `meta.request_id`).

## Responses (beta)

```
openrouter responses create --model <slug> --input <text> --json
```

New OpenRouter Responses API surface; flags subject to change.

## Video (async)

| Command | Purpose |
|---|---|
| `video create <prompt> --model <slug>` | Submit job → returns `id` |
| `video status <id>` | One-shot status |
| `video wait <id>` | Block until terminal; exit 73 on failure |
| `video download <id> -o <path>` | Download finished asset |

## Config

```
openrouter config get <key>
openrouter config set <key> <value>
openrouter config unset <key>
openrouter config path
openrouter config doctor [--json]
```

TOML path: `~/.config/openrouter/config.toml` (override with `OPENROUTER_CONFIG_PATH`).

Common keys: `defaults.model`, `defaults.timeout_ms`, `defaults.base_url`.

## Completion

```
openrouter completion bash|zsh|fish > ~/.config/...
```

Generate shell completion script.

## Global flags (all commands)

| Flag | Env | Default |
|---|---|---|
| `--api-key` | `OPENROUTER_API_KEY` | (keychain) |
| `--management-key` | `OPENROUTER_MANAGEMENT_KEY` | (keychain) |
| `--base-url` | `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` |
| `--timeout <ms>` | — | 30000 |
| `--json` | — | false |
| `--output <fmt>` | — | text |
| `--help`, `--version` | — | — |
