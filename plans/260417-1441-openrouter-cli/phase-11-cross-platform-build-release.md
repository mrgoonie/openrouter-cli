---
phase: 11
title: "Cross-platform build + release pipeline"
status: completed
effort: "1d"
---

# Phase 11 — Cross-platform build + release pipeline

## Context
- Docs: `docs/tech-stack.md` (build targets), `docs/design-guidelines.md` (install channels)
- Depends on: phase-01 (toolchain); can run in parallel with phases 2–10
- Unblocks: phase-12 (docs polish references install)

## Goal
Tag-driven release that produces platform-specific single binaries (macOS arm64/x64, Linux arm64/x64, Windows x64), publishes them via GitHub Releases, bumps a Homebrew tap formula, publishes an npm wrapper, and exposes a `curl | sh` installer.

## Requirements
### Functional
- `scripts/build-binaries.ts` cross-compiles all 5 targets in one pass, stamping `VERSION` via `bun build --define`
- `scripts/release.ts` hashes each artifact (SHA-256), generates checksums, uploads to GH Release, updates Homebrew formula in sibling repo via PAT
- `.github/workflows/release.yml` triggered on `v*` tag
- `install.sh` fetches latest release, detects OS/arch, verifies SHA-256, drops binary to `/usr/local/bin/openrouter` (fallback `$HOME/.local/bin`)
- `npm publish` emits a small wrapper package that downloads the platform-specific binary on postinstall (fallback for users without `bun`)

### Non-functional
- Binaries reproducible: same source + same Bun version → identical SHA-256
- Release fails if `bun test`, `biome check`, or `tsc --noEmit` fail
- Gate publish on green CI from phase-01 workflow

## Files to create
- `scripts/build-binaries.ts` — compiles all 5 targets to `dist/openrouter-<target>[.exe]` (≤120 lines)
- `scripts/release.ts` — hashing + GH release upload + brew bump (≤150 lines)
- `.github/workflows/release.yml` — tag trigger, matrix, upload, brew bump PR, npm publish (≤150 lines)
- `install.sh` — curl installer (~80 lines of POSIX sh)
- `Formula/openrouter.rb.tpl` — Homebrew formula template with `#{VERSION}`, `#{SHA256_DARWIN_ARM64}`, `#{SHA256_DARWIN_X64}`, `#{SHA256_LINUX_X64}`, `#{SHA256_LINUX_ARM64}` placeholders
- `npm/openrouter-cli/package.json` — wrapper package metadata
- `npm/openrouter-cli/bin/openrouter.cjs` — postinstall downloader + shim

## Files to modify
- `package.json` — add `release` + `release:local` scripts

## Implementation steps
1. **build-binaries.ts**: define targets array, loop `Bun.spawn(['bun','build','src/main.ts','--compile','--minify','--sourcemap','--target',target,'--define',\`VERSION=\"${version}\"\`,'--outfile',outfile])`. Collect SHA-256 for each, write `dist/checksums.txt`.
2. **release.ts**:
   - Read tag from env (`GITHUB_REF_NAME`)
   - Upload `dist/*` to GH Release via `gh release create v... dist/*`
   - Compute SHA-256 hashes, fill `Formula/openrouter.rb.tpl` → open PR on `<user>/homebrew-tap` bumping formula
   - Trigger npm publish of wrapper
3. **release.yml**:
   - Trigger `on: push: tags: ['v*']`
   - Single job on `ubuntu-latest` (Bun cross-compiles all targets from one host)
   - Steps: checkout → setup-bun → `bun install --frozen-lockfile` → `bun run typecheck` → `bun run lint` → `bun test` → `bun run build:binaries` → `bun run release`
   - Secrets: `HOMEBREW_TAP_TOKEN`, `NPM_TOKEN`
4. **install.sh**:
   - Detect OS: `uname -s` (Darwin/Linux)
   - Detect arch: `uname -m` (x86_64 → x64, arm64 → arm64)
   - Fetch latest tag via GH API or accept `OPENROUTER_VERSION` env
   - `curl -L` binary + `curl -L` checksums → verify via `sha256sum -c` (or `shasum -a 256`)
   - Install to `$PREFIX/bin/openrouter` (default `/usr/local`, override `PREFIX=$HOME/.local`)
   - Print PATH hint + `openrouter --version`
5. **npm wrapper**:
   - `package.json`: `"bin": {"openrouter": "bin/openrouter.cjs"}`, `"postinstall": "node bin/openrouter.cjs --install"`
   - `bin/openrouter.cjs`: if `--install`, download platform binary; else re-exec downloaded binary with passed args
6. **Homebrew formula template** `Formula/openrouter.rb.tpl`: standard `class Openrouter < Formula` with per-arch url/sha blocks.
7. Manual release rehearsal on a pre-release tag (`v0.0.0-rc1`).

## Todo checklist
- [x] `scripts/build-binaries.ts`
- [x] `scripts/release.ts`
- [x] `.github/workflows/release.yml`
- [x] `install.sh`
- [x] `Formula/openrouter.rb.tpl`
- [x] `npm/openrouter-cli/` wrapper package
- [x] `package.json` release scripts
- [x] Pre-release rehearsal passes

## Completion notes
Phase 11 — 5/5 binaries built. Release pipeline (scripts/build-binaries.ts, scripts/release.ts, .github/workflows/release.yml, install.sh, Formula/openrouter.rb.tpl, npm/openrouter-cli/package.json, bin/openrouter.cjs).

## Success criteria
- Tagging `v0.1.0` produces a GH Release with 5 platform binaries + checksums
- `brew install <tap>/openrouter` installs and runs
- `curl -fsSL <url>/install.sh | sh` installs without root on non-standard `PREFIX`
- `npm i -g openrouter-cli` installs and shims correctly
- Reproducible: re-running build from same tag produces identical SHA-256

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Bun cross-compile emits different hashes across runs | Pin Bun version; disable sourcemap in release |
| Homebrew tap PR requires manual merge | Use `gh pr create --merge` with admin PAT or document manual step |
| npm namespace unavailable | Fall back to `openrouter-cli` package name |
| install.sh executed before verify | Verify SHA before moving binary into PATH |
| Windows signing missing | Release unsigned binary v1; document Windows Defender SmartScreen workaround; add Authenticode signing in v2 |

## Rollback
Delete release from GitHub; unpublish npm version within 72 h; revert Homebrew formula PR.
