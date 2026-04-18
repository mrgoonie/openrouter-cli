# macOS CI Reveals Three Orthogonal Bugs (Two Direct + One Verification Surprise)

**Date**: 2026-04-18 09:45  
**Severity**: High  
**Component**: config command (unset, doctor), CLI output pipeline  
**Status**: Resolved

## What Happened

PR #1 had two failing E2E tests on `macos-latest`. Initially looked platform-specific. Investigation revealed **three unrelated bugs**, two in the callstack and one waiting downstream.

## The Brutal Truth

The satisfaction here is tempered by how close we came to shipping bug #3 to production. The "fix #1 and #2, then re-run tests" cycle is what saved us—but only because that Step 5 verification gate existed. Without it, every CLI consumer piping JSON would have gotten garbage in stdout from an unconditional parent footer.

## Technical Details

**Bug #1: `config unset` silent no-op**  
`writeConfigFile` in `src/lib/config/file.ts` deep-merged the unset call onto disk state. Calling `writeConfigFile({defaults: {}})` preserved the deleted key because merge is idempotent. Fix: extracted `atomicWriteToml` helper, added `rewriteConfigFile(config)` that writes verbatim. `config unset` now uses rewrite instead of merge.

**Bug #2: `config doctor` wrong envelope shape**  
`src/commands/config.ts` emitted `data: { vars, config_file, keychain }` (nested object). Test and JSON contract expected `data: rows[]` + `meta: { config_file, keychain }`. Fix: split envelope; widened `Meta` in `src/lib/output/json.ts` with `[key: string]: unknown` index signature to accept extra keys.

**Bug #3: Parent `run` unconditional footer polluted stdout**  
After fixing #1 and #2, re-run surfaced 3 new E2E failures (`config set then get`, `config path`, `config doctor`). Root: `src/main.ts` unconditionally logged `openrouter v0.0.0\nRun openrouter --help for usage.` even when citty fired a sub-command. Destroyed pipe-safety of JSON output. Fix: guarded footer behind `!isKnownSubcommand(argv[0])`.

## What We Tried

- Initial assumption: macOS-specific platform issue (WRONG)
- Grep/search for unset in config logic (found the merge)
- Traced envelope construction in doctor (found shape mismatch)
- Re-ran full E2E suite after fixes (exposed the footer pollution)

## Root Cause Analysis

All three are **implementation oversights during initial feature work**, not refactoring regressions:
1. Didn't think through merge semantics for deletion
2. Inconsistent envelope shape between implementation and contract
3. Missed that citty invokes parent `run` even when sub-command matches

macOS CI happened to run before Windows/Linux, but these bugs existed on all platforms.

## Lessons Learned

**Step 5 verification (re-run full tests after fixes) is load-bearing.** Without it, bug #3 ships silently—it only shows up under piping pressure in real usage. One-off test fixes are dangerous.

Widening `Meta` with an index signature feels like a type-safety loss but is correct—the alternative (threading generics) over-engineers. Accept the pragma.

## Next Steps

- [x] All 7 E2E tests pass (14 assertions, 1031ms)
- [x] Biome linting clean
- [x] TypeScript check clean
- [ ] Merge PR #1
- [ ] Monitor main branch for any downstream stdout pollution reports
