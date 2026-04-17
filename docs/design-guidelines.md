# Design Guidelines — `openrouter` CLI

**Binary name:** `openrouter` · alias suggestion: `or`
**Philosophy:** Humans first when TTY · agents first when piped/`--json` · same command serves both.

---

## 1. Command tree (noun-verb, git-style)

```
openrouter <noun> <verb> [args] [flags]
```

| Group | Commands | Auth | Endpoint |
|---|---|---|---|
| **auth** | `login` (OAuth PKCE) · `logout` · `status` · `whoami` · `set-key <k>` | — | `/auth/keys` |
| **chat** | `send <msg>` · `completion` (alias) · supports `--stream` | user key | `POST /chat/completions` |
| **responses** | `create` — beta OpenAI-compat | user key | `POST /responses` |
| **models** | `list` · `get <id>` · `endpoints <author>/<slug>` | user key | `GET /models`, `GET /models/{a}/{s}/endpoints` |
| **providers** | `list` | user key | `GET /providers` |
| **embeddings** | `create` (stdin/file/flag) | user key | `POST /embeddings` |
| **rerank** | `run --query <q> --docs <f>` | user key | `POST /rerank` |
| **generations** | `get <id>` · `cost <id>` | user key | `GET /generation` |
| **credits** | `show` | mgmt | `GET /credits` |
| **analytics** | `activity [--date] [--key-hash] [--user]` | mgmt | `GET /activity` |
| **keys** | `list` · `create` · `get` · `update` · `delete` | mgmt | `/keys` |
| **guardrails** | `list` · `create` · `get` · `update` · `delete` · `assign-keys` · `assign-members` · `assignments <id>` | mgmt | `/guardrails` |
| **org** | `members` | mgmt | `GET /organization/members` |
| **video** | `create` · `status <id>` · `wait <id>` · `download <id>` | user key | `POST /videos` |
| **config** | `get <k>` · `set <k> <v>` · `unset <k>` · `list` · `path` · `doctor` | — | — |
| **completion** | `bash` · `zsh` · `fish` · `powershell` | — | — |
| **version** | — | — | — |

**Naming rules:** verbs are standard CRUD words (`list`, `get`, `create`, `update`, `delete`). Avoid `update` vs `upgrade` collisions. Irregular verbs only when English reads wrong (`send`, `wait`, `download`).

---

## 2. Global flags (all commands)

| Flag | Env var | Default | Purpose |
|---|---|---|---|
| `--api-key <k>` | `OPENROUTER_API_KEY` | — | User/provisioning key |
| `--management-key <k>` | `OPENROUTER_MANAGEMENT_KEY` | — | Admin endpoints |
| `--base-url <url>` | `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | For testing/proxies |
| `--output <fmt>` / `-o` | `OPENROUTER_OUTPUT` | `auto` (TTY→pretty, pipe→json) | `json`, `ndjson`, `table`, `text`, `yaml` |
| `--json` | — | — | Shortcut: `--output json` |
| `--no-color` | `NO_COLOR=1` | auto (off when non-TTY) | Disable ANSI |
| `--verbose` / `-v` | `OPENROUTER_VERBOSE` | off | Debug logs → stderr |
| `--quiet` / `-q` | — | off | Suppress progress, errors only |
| `--config <path>` | `OPENROUTER_CONFIG` | `$XDG_CONFIG_HOME/openrouter/config.toml` | Custom config file |
| `--timeout <dur>` | `OPENROUTER_TIMEOUT` | `60s` (chat) / `none` (video wait) | HTTP timeout |
| `--non-interactive` | `CI=1` auto | auto | Never prompt, fail fast |
| `--http-referer <url>` | `OPENROUTER_SITE_URL` | — | Set `HTTP-Referer` header |
| `--app-name <name>` | `OPENROUTER_APP_NAME` | — | Set `X-Title` header |
| `--version` | — | — | Print version |
| `--help` / `-h` | — | — | Stable help output |

---

## 3. Key resolution (deterministic precedence)

Highest to lowest — **first source wins**:

1. `--api-key` / `--management-key` flag
2. Process environment (inherited from shell)
3. `.env.<mode>.local` in CWD — `mode` = `OPENROUTER_ENV` or `development`
4. `.env.local` in CWD
5. `.env.<mode>` in CWD
6. `.env` in CWD
7. Walk up parent dirs (repeat steps 3–6) until `.git` or filesystem root
8. `$XDG_CONFIG_HOME/openrouter/config.toml` → `[auth] api_key = …`
9. OS keychain (macOS Keychain / libsecret / Windows Cred Manager) — **opt-in via `config.toml`**

Separate lookup for management key: same cascade, different var name (`OPENROUTER_MANAGEMENT_KEY`).

**Observability:** `openrouter config doctor` prints source of each resolved value.

---

## 4. Output format

### Auto mode (default)

- **TTY + no `--json`** → pretty: colored headers, tables, spinners
- **Piped / `CI=1` / `--json`** → JSON to stdout, logs to stderr

### JSON schema (stable contract)

```json
{
  "schema_version": "1",
  "success": true,
  "data": { /* endpoint response, passed through unchanged */ },
  "error": null,
  "meta": {
    "request_id": "gen_xxx",
    "elapsed_ms": 432,
    "generation_id": "gen_xxx"
  }
}
```

Errors:

```json
{
  "schema_version": "1",
  "success": false,
  "data": null,
  "error": {
    "code": "unauthorized",
    "message": "API key invalid or revoked",
    "hint": "Run `openrouter auth login` or set OPENROUTER_API_KEY",
    "status": 401,
    "request_id": "req_xxx"
  },
  "meta": { "elapsed_ms": 88 }
}
```

### NDJSON (streaming)

Chat streams, video polling ticks, large list pagination — one JSON object per line, no wrapping array.

### Stdout vs stderr

| Stream | Content |
|---|---|
| **stdout** | Final result (JSON or pretty) |
| **stderr** | Spinners, progress bars, warnings, `--verbose` logs, prompts |

Pipe-safe: `openrouter chat send "hi" --json | jq .data.choices[0].message.content`.

---

## 5. Exit codes

| Code | Meaning | HTTP trigger |
|---|---|---|
| `0` | Success | 2xx |
| `1` | Generic error | — |
| `2` | Invalid usage (bad flag/arg) | — |
| `64` | No API key found | — |
| `65` | Auth failure | 401 |
| `66` | Forbidden | 403 |
| `67` | Not found | 404 |
| `68` | Insufficient credits | 402 |
| `69` | Rate limited | 429 |
| `70` | Server error | 5xx |
| `71` | Timeout | — |
| `72` | Invalid response (JSON parse fail) | — |
| `73` | Async job failed / expired | — |

Agents branch on exit code: `0` = done, `69` = backoff + retry, `64/65` = surface to user.

---

## 6. Streaming UX

### Chat (SSE)

- Default: stream to stdout as text; metadata summary → stderr at end
- `--json` / `--output ndjson`: emit `{type: "delta", content: "..."}` lines
- Cancel via SIGINT → send proper close, print partial usage

### Video (async polling)

- `openrouter video create` returns job metadata immediately (`{id, polling_url, status}`)
- `openrouter video wait <id> [--interval 2s] [--timeout 20m]`:
  - Spinner + elapsed time (TTY)
  - NDJSON status ticks (piped)
  - Exponential backoff: 2s → 3s → 5s → cap 10s
  - Exit `73` on `failed`/`expired`/`cancelled`
- `--download <dir>` auto-downloads `unsigned_urls` on completion
- One-shot convenience: `openrouter video create --wait [--download .]`

---

## 7. Error messages (human mode)

Three-line format:

```
✗ authentication failed (401)
  └─ API key is invalid or revoked.
  → fix: run `openrouter auth login`, or set OPENROUTER_API_KEY
```

`--verbose` appends request_id, URL, headers (redacted), response body.

---

## 8. Help output

Cobra default + customizations:

- Examples for every leaf command
- `See also:` cross-references
- Deterministic ordering (alphabetical flags, defined order for verbs)
- Parseable sections (agents grep `Usage:` / `Flags:`)
- `openrouter <noun> --help` shows noun-level overview + verb list

---

## 9. OAuth PKCE flow (`auth login`)

1. Generate `code_verifier` (43–128 char, random)
2. `code_challenge = base64url(sha256(code_verifier))`
3. Open browser to `https://openrouter.ai/auth?callback_url=http://localhost:<port>&code_challenge=<c>&code_challenge_method=S256`
4. Start loopback HTTP listener on free port (try 8976, 8977, 8978…)
5. Browser redirect → CLI receives `code`
6. `POST https://openrouter.ai/api/v1/auth/keys` with `{code, code_verifier, code_challenge_method: "S256"}`
7. Persist returned key → `$XDG_CONFIG_HOME/openrouter/config.toml` or OS keychain
8. Show masked key + expiry

**Non-TTY fallback:** print auth URL, ask user to paste callback URL manually.

---

## 10. Config file (TOML)

`$XDG_CONFIG_HOME/openrouter/config.toml`:

```toml
schema = 1

[auth]
# api_key = "sk-or-v1-..."              # fallback; prefer env/keychain
# management_key = "sk-or-mgmt-..."
use_keychain = false

[defaults]
model = "anthropic/claude-sonnet-4-6"
output = "auto"
base_url = "https://openrouter.ai/api/v1"
timeout = "60s"

[headers]
http_referer = "https://my-app.example"
app_name = "My App"

[video]
poll_interval = "2s"
wait_timeout = "20m"
```

`openrouter config set defaults.model claude-opus-4-7` writes through.

---

## 11. Testing conventions

- Unit: every package
- Golden tests for `--help`, JSON output (ensures schema stability)
- HTTP mocks via `httptest.Server`
- `testscript` (rogpeppe) for end-to-end CLI flows
- No network calls in tests; fixtures in `testdata/`

---

## 12. Agent-friendly checklist

✅ Stable JSON schema with `schema_version`
✅ Machine-readable errors with `code`
✅ Stderr/stdout separation
✅ Deterministic exit codes
✅ `--help` parseable
✅ NDJSON for streams
✅ `--non-interactive` + auto-detect (`CI=1`, non-TTY)
✅ No hidden TTY-only prompts when piped
✅ `NO_COLOR` honored

---

## Unresolved

- Binary name: `openrouter` vs shorter `or` or `orv`? (propose `openrouter` primary, user can alias)
- Provisioning key distinct from user key in env? (research says no — reuse `OPENROUTER_API_KEY`)
- Default `--output auto` behavior when `--no-color` set but TTY detected? (assume still pretty, just mono)
