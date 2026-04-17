# API Key Resolution Patterns for CLI Tools

**Date**: 2026-04-17  
**Scope**: Standard patterns across OpenAI, Anthropic, GitHub CLI, OpenRouter SDKs  
**Sources**: 8 independent references (official docs, GitHub discussions, production tools)

---

## Key Resolution Precedence (RECOMMENDED)

Implement **highest-to-lowest** precedence in this order:

| Rank | Source | Load Condition | Override Behavior |
|------|--------|-----------------|------------------|
| 1 | `--api-key` CLI flag | Always checked first | Explicit = unambiguous |
| 2 | `OPENROUTER_API_KEY` (process env) | Inherited from parent shell | ENV vars persistent across invocation |
| 3 | `.env.local` in CWD | Dev-only, .gitignore'd | Lexical precedence (most specific) |
| 4 | `.env.<mode>` (dev/prod/test) | Mode-gated by `NODE_ENV` or CLI flag | Mode-specific override |
| 5 | `.env` in CWD | Fallback, .gitignore'd | Baseline for shared vars |
| 6 | `$XDG_CONFIG_HOME/openrouter/config.toml` | `~/.config/openrouter/` on Linux/macOS | Persistent user config |
| 7 | OS keychain (macOS/Linux/Win) | After config file checked | Most secure for unattended use |

**Rationale**: Explicit > Env > Dotenv (specific) > Dotenv (general) > Config file > Secure storage. Keychain last because it requires user interaction on first access.

---

## Env Var Naming Convention

**Primary**: `OPENROUTER_API_KEY` (aligns with OpenRouter docs + OpenAI/Anthropic patterns)  
**Verified by**:
- [OpenRouter API authentication docs](https://openrouter.ai/docs/api/reference/authentication)
- [OpenAI pattern: `OPENAI_API_KEY`](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [Anthropic pattern: `ANTHROPIC_API_KEY`](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)

**Do NOT use**: `OR_API_KEY` (ambiguous), `OPENROUTER_KEY` (LibreChat exception, not standard)

### Provisioning vs User Keys
**No separate env vars found** in standard practice. Both user and provisioning keys use `OPENROUTER_API_KEY`. Distinguish at application logic level (scopes/permissions embedded in key metadata).

---

## Dotenv Loading Semantics

### Standard Cascade (Next.js / Vite / dotenv-flow)
Implemented order (highest to lowest priority):

1. `.env.<mode>.local` (e.g., `.env.production.local`)
2. `.env.local` (always loaded, .gitignore'd)
3. `.env.<mode>` (mode-specific, e.g., `.env.production`)
4. `.env` (base, shared)

**Key behaviors**:
- **Variable expansion**: `DB_URL=${DATABASE_HOST}` supported in `dotenv` and `dotenvx`
- **Multi-line values**: Quoted strings handled; POSIX escapes supported
- **Comment syntax**: `# comment` and `export VAR=value` both work
- **NODE_ENV gating**: Mode files only load if `NODE_ENV` matches filename (dotenv-flow behavior)
- **Existing env overrides dotfiles**: Process-level env vars always win—dotfiles never overwrite

**Tool differences**:
- `dotenv` (basic): Single `.env` file; optional mode-based cascade
- `dotenvx`: Encrypted `.env.vault`; convention mode for Next.js compatibility
- `dotenv-flow`: Full cascade with NODE_ENV auto-detection
- Vite: Built-in dotenv loading, mode-aware (`.env.{mode}.local` > `.env.local` > `.env.{mode}` > `.env`)

---

## Monorepo .env Resolution

**Best practice**: Load upward from CWD to project root.

**Precedence within monorepo**:
1. Package-level `.env.local` (leaf)
2. Package-level `.env`
3. Root-level `.env.local`
4. Root-level `.env`

**Implementations**:
- `dotenv-mono`: Explicit upward walk with priority rules
- `monoenv`: Package-aware loading
- Vite: CWD-only (no upward search—use build tooling)

**Recommendation**: For CLI tools, implement upward search via `find-up` or equivalent (e.g., Node `find-up` package). Stop at `.git` or workspace root marker.

---

## Secret Storage: Keychain vs Dotenv

### When to Use Keychain
✓ Unattended CLI operations (CI/CD, cron)  
✓ Shared machines (multi-user safety)  
✓ Production deployments  
✓ Long-lived daemon processes

### When Dotenv Is Sufficient
✓ Local development (single-user, private machine)  
✓ Throwaway test environments  
✓ Teaching/examples  
⚠️ **ALWAYS .gitignore** .env, .env.local, .env.*.local

### Keychain Library Stack
- **Node**: `node-keytar` (C++ native binding; requires build tools)
  - Lightweight alternative: `@replit/keyring` (simpler API)
- **Python**: `keyring` or `SecretStorage` (D-Bus on Linux)
- **Go**: `keyring` (cgo; OS-specific backends)

**GitHub CLI precedence** (proven pattern):  
1. `GH_TOKEN` env var → 2. OS keychain → 3. Encrypted config file

---

## Recommendation for openrouter-video

1. **Accept key via** (in order):
   - `--api-key` flag
   - `OPENROUTER_API_KEY` env var
   - `.env.local` (CWD)
   - `.env` (CWD)

2. **Dotenv**: Use `dotenv` or `dotenvx` with Next.js convention (if in fullstack project) or simple `.env` loading (if CLI-only).

3. **Keychain**: Optional for v2+; not required for MVP. Implement only if CLI will run unattended (e.g., GitHub Actions, CI/CD).

4. **Config file**: `~/.config/openrouter/config.toml` (lower priority than env vars). Example:
   ```toml
   [auth]
   api_key = "sk-or-..."  # Fallback only
   ```

5. **Env var name**: `OPENROUTER_API_KEY` (standard, matches OpenAI/Anthropic conventions).

6. **Error messaging**: Check in order, report which source was used (aids debugging):
   ```
   ✓ Using API key from --api-key flag
   ✓ Using API key from $OPENROUTER_API_KEY
   ✓ Using API key from .env.local
   ⚠️ No API key found. Set OPENROUTER_API_KEY or use --api-key
   ```

---

## Sources

- [OpenAI API Key Best Practices](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [Claude API Key Best Practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)
- [OpenRouter API Authentication](https://openrouter.ai/docs/api/reference/authentication)
- [GitHub CLI Auth Token Storage](https://github.com/cli/cli/discussions/12488)
- [dotenv-flow NPM Documentation](https://www.npmjs.com/package/dotenv-flow)
- [Vite Environment Variables Guide](https://vite.dev/guide/env-and-mode)
- [Dotenvx Multiple Environments](https://dotenvx.com/docs/quickstart/environments)
- [Python Keyring Library](https://pypi.org/project/keyring/)

---

## Unresolved Questions

1. **Specific OpenRouter provisioning API key type**: Are provisioning keys a distinct credential type, or do they share `OPENROUTER_API_KEY` naming with user keys? *(Docs unclear; may require OpenRouter support)*
2. **Search-upward scope for monorepo**: Should CLI stop at `.git`, `package.json`, or custom marker file? *(Project-specific decision; no industry standard)*
3. **Keychain on CI/CD**: How to handle keychain in headless environments (GitHub Actions, Docker)? *(Use env vars + secrets manager; keychain not applicable)*
