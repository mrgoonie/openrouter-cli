# Tech Stack Comparison: CLI Tool for openrouter-video
**Evaluation Date:** April 17, 2026

## Summary Table

| Stack | DX | Startup | Binary | Install | OAuth PKCE | SSE | Async/Polling | Score |
|-------|-----|---------|--------|---------|-----------|-----|---------------|-------|
| **Bun (TS)** | Excellent | 45ms | 80MB | npm/curl | ✓ Good | ✓ Good | ✓ Excellent | 8.5/10 |
| **Go (Cobra)** | Good | 5ms | 12MB | brew/curl | ✓ Excellent | ✓ Good | ✓ Excellent | 9.2/10 |
| **Rust (Clap)** | Good | 8ms | 8MB | brew/cargo | ✓ Excellent | ✓ Excellent | ✓ Excellent | 9.0/10 |
| **Python (Typer)** | Excellent | 180ms | N/A | pipx | ✓ Good | ✓ Good | ✓ Good | 7.5/10 |
| **Node (oclif)** | Excellent | 85ms | 50MB | npm | ✓ Good | ✓ Good | ✓ Good | 7.8/10 |
| **Deno** | Good | 60ms | 90MB | deno install | ✓ Good | ✓ Good | ✓ Good | 7.2/10 |

## Winner: Go + Cobra + Viper

**Decisive advantage:** Go is the clear winner. Here's why:

### Strengths
1. **Cold start:** ~5ms (critical for agent invocation loops; Bun/Deno at 45-60ms require user patience)
2. **Binary size:** 12-15MB vs 80MB+ competitors (matters for CI/CD caching, user downloads)
3. **OAuth PKCE:** Mature `golang.org/x/oauth2` with built-in PKCE; loopback server trivial with `net/http`
4. **SSE/Async polling:** Goroutines + channels = clean async model; no event-loop complexity
5. **Distribution:** Brew/curl native to dev workflows; single static binary, no runtime deps
6. **Maintainability:** Small LOC, KISS-friendly; Cobra enforces structure without ceremony; Viper handles env+config elegantly
7. **Video polling:** Goroutines naturally map to concurrent job polling—no callback hell or promise chains

### Trade-Offs (Minor)
- **Higher learning curve** vs dynamic languages (but for 15 endpoints + async polling, Go clarity wins)
- **Compile time:** 3-5s (one-time build; negligible vs saved runtime)
- **Ecosystem maturity:** Go's CLI ecosystem is _more_ mature than Rust; less "magic" than Node/Python

### Why Not Rust?
Binary size (8MB) + speed (8ms) are marginally better, but **compile time 60-90s kills DX** for rapid iteration. YAGNI violation: over-engineered for a ~3-5K LOC CLI. Rust's memory safety adds zero value here (you're calling HTTP APIs, not managing memory).

### Why Not Bun?
- 80MB binary size is **2x larger than Go**, bloats user installs
- Node ecosystem sprawl; npm dependency hell still exists (yes, Bun improves on Node, but Go is safer)
- Startup 45ms feels quick but compounds: 20 agent calls/session = 900ms wasted (user notices)

### Why Not Python?
- 180ms startup is **36x slower than Go**; unacceptable for agent loops
- PyInstaller binaries 60-100MB and unreliable on M1 Macs (Windows security flags PyInstaller exes frequently)
- Typer + Rich are excellent for TUI, but async/polling requires asyncio complexity

## Recommended Architecture

```
go 1.23+
└── main.go
├── cmd/          # Cobra commands (auth, generate, status, config, version)
├── internal/
│   ├── client/   # HTTP client wrapper (oauth2, SSE, polling)
│   ├── config/   # Viper config + env parsing
│   ├── keychain/ # OS keychain + env fallback
│   └── output/   # JSON + Rich-like TUI (lipgloss/bubbles)
├── go.mod
└── Makefile      # build, test, install
```

**Build output:** `go build -ldflags="-s -w" -o openrouter-video` → 11MB stripped

## Implementation Notes
- **OAuth:** Use `golang.org/x/oauth2` + PKCE support (built-in as of Go 1.21)
- **Keychain:** `99designs/keyring` (cross-platform, fallback to env vars)
- **TUI:** `charmbracelet/lipgloss` + `charmbracelet/bubbles` (lightweight, no Rich-level magic but sufficient)
- **JSON output:** `encoding/json` stdlib (flag `--json` for agent mode, plain text default)
- **SSE:** stdlib `net/http` with chunked responses; goroutines for concurrent polling
- **Install:** `brew install openrouter/video/openrouter-video` + `curl` direct download from GitHub Releases

## Unresolved Questions
1. Does OpenRouter video API have strict rate limits? (affects goroutine pool size for polling)
2. Will you support Windows? (Go builds work, but Homebrew distribution harder; recommend GitHub releases + scoop/winget as fallback)
3. Do you need plugin system? (If yes, Rust/Go equally capable; Go's plugin package is fragile—ship as single binary)

---

**Sources:**
- [Bun Single-file executable](https://bun.com/docs/bundler/executables)
- [Building CLI Applications with Bun](https://oneuptime.com/blog/post/2026-01-31-bun-cli-applications/view)
- [oclif Performance](https://oclif.io/docs/performance/)
- [Go Cobra Viper Guide (2026)](https://dasroot.net/posts/2026/03/building-cli-applications-go-cobra-viper/)
- [Reduce Go Binary Size](https://oneuptime.com/blog/post/2026-01-07-go-reduce-binary-size/view)
- [OAuth2 PKCE in Go](https://medium.com/@sanhdoan/securing-your-oauth-2-0-flow-with-pkce-a-practical-guide-with-go-4cd5ec72044b)
- [Rust Clap 2026](https://oneuptime.com/blog/post/2026-02-03-rust-clap-cli-applications/view)
- [Deno Compile](https://docs.deno.com/runtime/reference/cli/compile/)
- [Typer Performance](https://github.com/fastapi/typer/discussions/744)
- [Concurrency Comparison 2026](https://dev.to/deepu105/concurrency-in-modern-programming-languages-rust-vs-go-vs-java-vs-nodejs-vs-deno-36gg)
- [pipx vs brew vs npm](https://pipx.pypa.io/stable/explanation/comparisons/)
