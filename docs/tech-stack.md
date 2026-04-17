# Tech Stack

**Decision:** Bun 1.1+ · TypeScript strict · Citty (CLI) · single-binary compile

## Why Bun (chosen by user override of Go recommendation)

- Native `fetch` (fastest HTTP client in JS ecosystem, full ReadableStream support for SSE)
- `bun build --compile` → platform-specific single binaries (macOS/Linux/Windows, x64/arm64)
- Built-in TypeScript, test runner, dotenv, sqlite → fewer deps
- ~45 ms cold start (acceptable; mitigated by agent-side batching)
- TypeScript DX matches user's ecosystem; easier contrib than Go

**Trade-offs accepted:** ~80 MB binary (gzipped ~25 MB), Node-world dependency risk surface, slower startup than Go. Worth it for DX + TS types when wrapping 16 endpoint groups.

## Runtime + libraries (pinned)

| Purpose | Package | Why |
|---|---|---|
| CLI framework | `citty` (unjs) | TypeScript-first, tiny, subcommand router, stable help output |
| Config/env merge | `c12` (unjs) | Layered config: defaults → file → env → CLI; async loaders |
| Dotenv cascade | `dotenv` + custom loader | Multi-file precedence (`.env.local` > `.env.<mode>` > `.env`) with upward search |
| HTTP | `Bun.fetch` (native) | Zero deps, HTTP/2, stream |
| SSE parser | `eventsource-parser` | Battle-tested SSE decoder |
| OAuth PKCE | `Bun.serve` + `crypto.subtle` | Loopback listener + SHA-256; no dep |
| Keychain | `@napi-rs/keyring` | Rust-based, no node-gyp, works with Bun |
| Rich output | `picocolors` + `cli-table3` | Tiny, TTY-aware |
| Spinner/progress | `@clack/prompts` | Modern, accessible, TTY-aware, falls back gracefully |
| TUI picker | `@clack/prompts` (select + search) | For `chat` model picker; no heavy React/Ink |
| Zod | `zod` | Runtime validation of API responses + schema inference |
| Testing | `bun test` (built-in) | Fast, Jest-compatible assertions |
| Lint/format | `biome` | Single tool for lint + format, TS-aware |

**Excluded:** `commander` (older API, heavier), `oclif` (big plugin framework, YAGNI), `inquirer` (legacy), `ink` (React overhead for CLI), `keytar` (node-gyp pain).

## Layout

```
openrouter-video/
├── src/
│   ├── main.ts                          # entrypoint, wires root command
│   ├── commands/                        # one file per noun (citty subcommands)
│   │   ├── auth.ts                      # login (PKCE) · logout · status · whoami · set-key
│   │   ├── chat.ts                      # send (alias: completion) — SSE streaming
│   │   ├── responses.ts                 # beta OpenAI-compatible
│   │   ├── models.ts                    # list · get · endpoints
│   │   ├── providers.ts
│   │   ├── embeddings.ts
│   │   ├── rerank.ts
│   │   ├── generations.ts
│   │   ├── credits.ts
│   │   ├── analytics.ts
│   │   ├── keys.ts                      # mgmt: list/create/get/update/delete
│   │   ├── guardrails.ts                # mgmt: crud + assign
│   │   ├── org.ts                       # mgmt: members
│   │   ├── video.ts                     # create · status · wait · download
│   │   ├── config.ts                    # get · set · unset · list · path · doctor
│   │   └── completion.ts                # bash/zsh/fish/pwsh generator
│   ├── lib/
│   │   ├── client/
│   │   │   ├── client.ts                # fetch wrapper, auth, headers, retries
│   │   │   ├── sse.ts                   # SSE parser with cancellation
│   │   │   ├── poll.ts                  # exponential backoff for async jobs
│   │   │   └── errors.ts                # HTTPError → typed + exit-code mapping
│   │   ├── config/
│   │   │   ├── resolve.ts               # precedence engine
│   │   │   ├── dotenv-cascade.ts        # .env.* upward search loader
│   │   │   ├── keychain.ts              # @napi-rs/keyring wrapper
│   │   │   └── file.ts                  # TOML config read/write
│   │   ├── output/
│   │   │   ├── renderer.ts              # auto: TTY→pretty, pipe→json
│   │   │   ├── json.ts                  # stable schema envelope
│   │   │   ├── table.ts                 # cli-table3 rendering
│   │   │   ├── ndjson.ts                # line-delimited streams
│   │   │   └── tty.ts                   # TTY detect, NO_COLOR, isCI
│   │   ├── oauth/
│   │   │   ├── pkce.ts                  # code_verifier + challenge
│   │   │   └── loopback-server.ts       # Bun.serve listener
│   │   ├── errors/
│   │   │   └── exit-codes.ts            # typed error → numeric exit
│   │   ├── tui/
│   │   │   └── model-picker.ts          # @clack/prompts search
│   │   └── types/
│   │       ├── openrouter.ts            # API response zod schemas
│   │       └── config.ts                # config file schema
│   └── version.ts                       # injected at build
├── tests/
│   ├── fixtures/                        # recorded API responses
│   ├── unit/
│   └── e2e/                             # subprocess CLI invocations
├── docs/
├── plans/
├── scripts/
│   ├── build-binaries.ts                # bun build --compile for all targets
│   └── release.ts                       # GitHub Releases upload
├── .github/workflows/
│   ├── ci.yml                           # test + lint
│   └── release.yml                      # tag → build → release → brew tap bump
├── package.json
├── tsconfig.json
├── biome.json
├── bunfig.toml
└── README.md
```

## Build & distribute

### Local dev
```bash
bun install
bun run dev -- chat send "hello"        # runs src/main.ts directly
bun test
bun run build                           # emits ./bin/openrouter
```

### Cross-platform binaries (release)
```bash
bun build src/main.ts --compile --minify --sourcemap \
  --target=bun-darwin-arm64    --outfile dist/openrouter-darwin-arm64
bun build src/main.ts --compile --minify --sourcemap \
  --target=bun-darwin-x64      --outfile dist/openrouter-darwin-x64
bun build src/main.ts --compile --minify --sourcemap \
  --target=bun-linux-x64       --outfile dist/openrouter-linux-x64
bun build src/main.ts --compile --minify --sourcemap \
  --target=bun-linux-arm64     --outfile dist/openrouter-linux-arm64
bun build src/main.ts --compile --minify --sourcemap \
  --target=bun-windows-x64     --outfile dist/openrouter-windows-x64.exe
```

### Distribution channels (v1)
- `npm i -g @openrouter/cli` (runs via Node/Bun)
- `curl -fsSL https://…/install.sh | sh` (detects OS, downloads binary)
- `brew install openrouter` (custom tap: `user/openrouter`)
- Direct download: GitHub Releases per platform
- Windows: scoop bucket + direct `.exe`

## CI / release (GitHub Actions)

- `ci.yml`: on PR + push → `bun install` → `bun run lint` → `bun test` → matrix compile check
- `release.yml`: on `v*` tag → build all targets → upload GH Release → bump Homebrew tap formula → publish npm

## v1 included features (per user selection)

✅ **Shell completion** — citty's built-in completion generator (`openrouter completion zsh`)
✅ **OS keychain** — `@napi-rs/keyring`, opt-in via `config set auth.use_keychain true`
✅ **Auto-release** — GH Actions matrix build + brew tap bump + npm publish
✅ **TUI model picker** — `@clack/prompts` interactive select (`openrouter chat send -i`)

## Env var conventions

| Var | Purpose | Cascade |
|---|---|---|
| `OPENROUTER_API_KEY` | User/provisioning key | flag → env → .env.* → config → keychain |
| `OPENROUTER_MANAGEMENT_KEY` | Admin endpoints (keys, guardrails, credits, analytics, org) | same cascade, separate lookup |
| `OPENROUTER_BASE_URL` | Override API base URL | — |
| `OPENROUTER_OUTPUT` | Default output format | — |
| `OPENROUTER_SITE_URL` | `HTTP-Referer` header | — |
| `OPENROUTER_APP_NAME` | `X-Title` header | — |
| `OPENROUTER_CONFIG` | Config file path | — |
| `NO_COLOR` | Disable colors (standard) | — |
| `CI` | Auto non-interactive mode | — |

## Unresolved

- npm package scope: `@openrouter/cli` (needs official namespace) or `openrouter-cli`?
- Homebrew tap name: `openrouter/tap` or personal tap?
- Min Bun version — pin to 1.1.38 (April 2026 stable) or track latest?
