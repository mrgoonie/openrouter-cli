---
phase: 1
title: "Scaffold tooling"
status: completed
effort: "4h"
---

# Phase 01 — Scaffold + tooling

## Context
- Docs: `docs/tech-stack.md` (deps + layout), `docs/design-guidelines.md` (binary name `openrouter`)
- Depends on: —
- Unblocks: phase-02 (needs toolchain), phase-11 (CI reuses this workflow skeleton)

## Goal
Bootstrap a Bun+TS project so `bun install && bun run dev -- --version` prints the CLI version. No business logic yet — just the toolchain, linter, type-checker, CI skeleton, and a minimal citty root command.

## Requirements
### Functional
- `bun run dev -- --version` → prints version string (from `src/version.ts`)
- `bun run lint` / `format` / `typecheck` / `test` all wired via npm scripts
- Root command `openrouter` registers (no subcommands yet); `--help` prints citty help
- CI runs install → typecheck → lint → test on push/PR

### Non-functional
- TypeScript strict mode · ES modules · NodeNext resolution · `noUncheckedIndexedAccess`
- Biome handles both lint and format (single tool)
- Deps pinned (exact versions) per tech-stack.md
- `.env*` (except `.env.example`) + `node_modules` + `dist` + `bin` ignored by git

## Files to create
- `package.json` — Bun engines, scripts, pinned deps (≤80 lines)
- `tsconfig.json` — strict, NodeNext, ESNext (≤40 lines)
- `biome.json` — lint + format rules, tab width 2, single quotes (≤40 lines)
- `bunfig.toml` — test config (≤20 lines)
- `.gitignore` — `node_modules/`, `.env*`, `!.env.example`, `dist/`, `bin/`, `.DS_Store`, `*.tsbuildinfo` (≤20 lines)
- `.editorconfig` — 2 spaces, LF, utf-8 (≤15 lines)
- `.github/workflows/ci.yml` — matrix macos-latest + ubuntu-latest, steps: checkout → setup-bun → `bun install --frozen-lockfile` → `bun run typecheck` → `bun run lint` → `bun test` (≤60 lines)
- `README.md` — stub with install + quickstart placeholders (≤60 lines)
- `LICENSE` — MIT (≤25 lines)
- `src/main.ts` — citty `defineCommand` + `runMain`; root wires `--version`, `--help` (≤40 lines)
- `src/version.ts` — `export const VERSION = '0.0.0'` (≤5 lines)

## Files to modify
- none

## Implementation steps
1. Create `package.json`:
   - `"name": "openrouter-cli"`, `"type": "module"`, `"bin": { "openrouter": "./bin/openrouter" }`
   - `"engines": { "bun": ">=1.1.38" }`
   - `devDependencies`: `typescript`, `@biomejs/biome`, `@types/bun`
   - `dependencies`: `citty`, `c12`, `dotenv`, `eventsource-parser`, `@napi-rs/keyring`, `picocolors`, `cli-table3`, `@clack/prompts`, `zod`, `smol-toml`
   - Scripts: `dev` (`bun run src/main.ts`), `build` (`bun build src/main.ts --compile --minify --outfile bin/openrouter`), `test` (`bun test`), `lint` (`biome check .`), `format` (`biome format --write .`), `typecheck` (`tsc --noEmit`)
2. Create `tsconfig.json`: `"strict": true`, `"moduleResolution": "bundler"`, `"module": "ESNext"`, `"target": "ES2022"`, `"types": ["bun-types"]`, `"noUncheckedIndexedAccess": true`, include `src/**/*` + `tests/**/*`.
3. Create `biome.json` — `recommended` rules, formatter line width 100, single quotes, trailing comma `all`.
4. Create `bunfig.toml` — `[test] preload = []`.
5. Create `src/version.ts` with `export const VERSION = '0.0.0';`. Comment: overridden at build via `--define`.
6. Create `src/main.ts`: import `defineCommand`, `runMain` from `citty`; root command `meta.name = 'openrouter'`, `meta.version = VERSION`, `meta.description = 'OpenRouter CLI'`, empty `subCommands`. Call `runMain(main)`.
7. Write `ci.yml` using `oven-sh/setup-bun@v2` (matrix: macos-latest + ubuntu-latest, bun-version `1.1.38`).
8. Write `.gitignore`, `.editorconfig`, `LICENSE` (MIT).
9. Write `README.md` stub: title, 2-line description, `## Install`/`## Quickstart` placeholders, link to `docs/design-guidelines.md`.
10. Run `bun install`, commit `bun.lock`.
11. Smoke: `bun run dev -- --version` prints `0.0.0`.
12. `bun run lint && bun run typecheck && bun test` all exit 0.

## Todo checklist
- [x] `package.json` with pinned deps + scripts
- [x] `tsconfig.json` strict + bundler
- [x] `biome.json` lint+format
- [x] `bunfig.toml`
- [x] `.gitignore`, `.editorconfig`
- [x] `LICENSE` (MIT)
- [x] `src/main.ts` + `src/version.ts`
- [x] `.github/workflows/ci.yml`
- [x] `README.md` stub
- [x] `bun install` + commit lockfile
- [x] Smoke: `bun run dev -- --version` prints
- [x] `bun run lint && bun run typecheck && bun test` all green

## Completion notes
Phase 1 — Scaffold complete. Bun+TS project bootstrapped with package.json, tsconfig, biome, CI workflow, src/main.ts + version.ts, all build scripts wired.

## Success criteria
- `bun run dev -- --version` prints a version string to stdout and exits 0
- `bun run dev -- --help` prints citty help without error
- `bun run lint`, `bun run typecheck`, `bun test` exit 0
- CI workflow exists and references only verified actions

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Bun version drift on contributor machines | Pin `engines.bun` + document in README |
| Biome + Prettier double-format conflict | Use Biome exclusively; no Prettier dep |
| `@napi-rs/keyring` fails on minimal Linux | Document `libsecret-1-dev` prerequisite; keychain is opt-in |
| Editor missing Bun globals | Add `"types": ["bun-types"]` in tsconfig |

## Rollback
Delete created files; no downstream dependencies yet.
