# Product Development Requirements — OpenRouter CLI

## Vision

Single CLI that wraps the entire OpenRouter API, usable by **humans at a terminal** and **AI agents in scripts** with the same commands. Zero surprise for either audience.

## Target users

| Persona | Primary use |
|---|---|
| **Developer** | Quick chat, list models, inspect generations, manage keys |
| **AI agent** | Programmatic invocation — chat, rerank, embeddings, video pipeline |
| **Org admin** | Provision keys, set guardrails, check credits/analytics |

## Must-have (v1)

- All 16 endpoint groups reachable via subcommands
- OAuth PKCE `login`
- Key resolution: flag > env > `.env.*` cascade > config file
- Streaming chat (SSE) + async video polling
- `--json` global flag with stable schema
- TTY detection for color/spinners/prompts
- Stable exit codes
- macOS + Linux binaries · Windows best-effort

## Nice-to-have (v2)

- OS keychain integration (macOS/Linux/Windows)
- Shell completion plugins (bash/zsh/fish/pwsh)
- Plugin system (out of scope if YAGNI)
- TUI mode for interactive model picking
- Offline model/provider cache

## Non-goals

- Web dashboard (openrouter.ai handles it)
- Local model inference
- Proxy server mode (v3+ maybe)
- Multi-provider routing beyond OpenRouter

## Success metrics

| Metric | Target |
|---|---|
| Cold start | <10 ms |
| Binary size | <15 MB stripped |
| `openrouter chat send "hi"` p50 latency | <500 ms excluding model |
| JSON schema stability | no breaking change within major version |
| Agent invocation success rate | >99% (excluding upstream errors) |

## Risks

| Risk | Mitigation |
|---|---|
| OpenRouter API schema drift | Pass through unknown fields; `schema_version` in output |
| Video jobs exceed timeout | Configurable `--timeout`; exit code 71; `status <id>` resumable |
| OAuth PKCE loopback port collision | Try multiple ports; non-TTY fallback prints URL |
| Management key leaked to logs | Redact in verbose output; never log Bearer headers |

## Open questions

- Binary name finalized (`openrouter` vs `or`)?
- Provisioning vs user key — distinct env var or shared?
- Min Go version (1.22 vs 1.23)?
- Ship `install.sh` curl installer at v1?
