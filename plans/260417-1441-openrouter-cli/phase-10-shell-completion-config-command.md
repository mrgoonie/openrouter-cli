---
phase: 10
title: "Shell completion + config command"
status: completed
effort: "0.5d"
---

# Phase 10 — Shell completion + `config` command

## Context
- Docs: `docs/design-guidelines.md` §1 (config verbs), §10 (TOML schema)
- Depends on: phase-03 (config file + keychain), phase-02 (renderer)
- Unblocks: phase-12

## Goal
Ship first-class shell completion generators and a `config` command group that lets humans and agents introspect + edit the TOML config. `config doctor` is the single source of truth for debugging key/setting resolution.

## Requirements
### Functional — completion
- `openrouter completion bash|zsh|fish|powershell` prints shell-appropriate completion script to stdout
- Output stable (diff-friendly), no dynamic timestamps

### Functional — config
- `openrouter config get <key>` — print value only (for scripting); respects dotted keys (`defaults.model`)
- `openrouter config set <key> <value>` — writes to TOML (creates file if missing); refuses `[auth]` writes unless `--unsafe` (prefer env or keychain)
- `openrouter config unset <key>` — removes key from TOML
- `openrouter config list` — pretty table or JSON of current TOML
- `openrouter config path` — print resolved config file path
- `openrouter config doctor` — resolver diagnostics: for each resolvable var print `{name, value_masked, source, valid}`; test keychain availability; print config file path + exist/valid

### Non-functional
- Completion scripts must not call the binary at expansion time (static lists only) to avoid startup cost
- `config set defaults.model foo` validates via zod before write
- `config doctor` must exit 0 even if auth missing (diagnostic command)

## Files to create
- `src/commands/completion.ts` — `bash`, `zsh`, `fish`, `powershell` verbs (≤120 lines)
- `src/commands/completion-templates/bash.sh` — handcrafted bash completion referencing all subcommands + global flags
- `src/commands/completion-templates/zsh.sh` — zsh compdef
- `src/commands/completion-templates/fish.fish` — fish complete rules
- `src/commands/completion-templates/pwsh.ps1` — PowerShell Register-ArgumentCompleter
- `src/commands/config.ts` — 6 verbs (≤180 lines)
- `src/lib/config/kv-path.ts` — `getByPath(obj, 'a.b.c')`, `setByPath(obj, path, value)`, `unsetByPath(obj, path)` (≤60 lines)

## Files to modify
- `src/main.ts` — register `completion` and `config`

## Implementation steps
1. **kv-path.ts**: tiny dotted-path helpers over plain objects.
2. **completion-templates/**: hand-author minimal scripts — prioritize top 10 subcommands (`chat send`, `models list`, `video create`, …) + global flags. Keep under 100 lines each.
3. **commands/completion.ts**: each verb returns template string via `process.stdout.write`. Use `await Bun.file(new URL('./completion-templates/bash.sh', import.meta.url)).text()` — embedded in binary after `bun build --compile`.
4. **commands/config.ts**:
   - `get <key>`: read, dotted lookup, print value or exit 1
   - `set <key> <value>`: parse value (`true/false/number/string`); zod validate merged object; `writeConfigFile(merged)`
   - `unset <key>`: read, unsetByPath, write
   - `list`: render table or JSON
   - `path`: print `configPath()`
   - `doctor`: for each var call the same resolver used by commands; print source; keychain liveness check; config file existence + parse status
5. Unit tests:
   - `kv-path.test.ts`: get/set/unset nested
   - `config.test.ts`: set → get round-trip; unsafe `auth.*` gating; doctor shape

## Todo checklist
- [x] `completion-templates/*` (4 files)
- [x] `commands/completion.ts`
- [x] `lib/config/kv-path.ts`
- [x] `commands/config.ts` (6 verbs)
- [x] `main.ts` wires both
- [x] Unit tests green
- [x] Manually verify: `eval "$(openrouter completion zsh)"` then `openrouter <tab>` expands

## Completion notes
Phase 10 — 406 tests. Completion + config (config/kv-path.ts, completion-templates/{bash,zsh,fish,pwsh}.ts as TS exports, commands/completion.ts, config.ts with 6 verbs).

## Success criteria
- `openrouter completion zsh | head -5` prints stable completion prefix
- `openrouter config set defaults.model anthropic/claude-opus-4-7 && openrouter config get defaults.model` round-trips
- `openrouter config doctor` shows every var + source even when unauthenticated
- `openrouter config set auth.api_key X` rejects without `--unsafe`

## Risks & mitigation
| Risk | Mitigation |
|---|---|
| Completion drift as commands added | Golden test snapshots script per shell; diff fails CI if changed unintentionally |
| `config set` corrupts TOML | Atomic write (tmp → rename); keep `.bak` for one prior version |
| Doctor leaks sensitive values | Always mask via `maskKey`; never print raw |
| Embedded templates missing in compiled binary | Verify via e2e: run compiled `bin/openrouter completion zsh` in test |

## Rollback
Remove `commands/completion.ts`, `commands/config.ts`, templates dir, `lib/config/kv-path.ts`.
