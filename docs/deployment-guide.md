# Deployment Guide

## User Install

### Homebrew (macOS / Linux)

```bash
brew install openrouter/tap/openrouter
```

### Curl (Linux / macOS — one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/user/openrouter-cli/main/install.sh | sh
```

The script detects OS/arch, downloads the matching binary from the latest GitHub release, and installs to `/usr/local/bin/openrouter`.

### npm / npx

```bash
npm install -g openrouter-cli
# or run without installing:
npx openrouter-cli --help
```

### Build from Source

Requires Bun ≥ 1.1.38.

```bash
git clone https://github.com/user/openrouter-cli
cd openrouter-cli
bun install
bun run build          # outputs bin/openrouter
./bin/openrouter --help
```

For development (no build step):

```bash
bun run dev -- --help
bun run dev -- chat send "hi" --model openai/gpt-4o
```

---

## Contributor Release Flow

### Prerequisites

Set these secrets in the GitHub repository (`Settings → Secrets → Actions`):

| Secret | Purpose |
|--------|---------|
| `GH_TOKEN` | GitHub token with `contents: write` scope (for release upload + formula PR) |
| `NPM_TOKEN` | npm publish token (`Automation` type) |
| `HOMEBREW_TAP_TOKEN` | Token with write access to the `homebrew-tap` repo |

### Release Steps

1. **Bump version** in `src/version.ts` and `package.json`:

   ```bash
   # Edit src/version.ts and package.json manually, then:
   git add src/version.ts package.json
   git commit -m "chore: bump version to X.Y.Z"
   ```

2. **Tag the release** — this triggers the CI release workflow:

   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```

3. **GitHub Actions** runs `.github/workflows/release.yml` which:
   - Runs `bun run build:binaries` (cross-compiles for all 5 targets)
   - Creates a GitHub release with binary assets and checksums
   - Publishes the npm package with `npm publish`
   - Opens a PR on the Homebrew tap to update the formula SHA256

4. **Verify**:
   ```bash
   brew update && brew upgrade openrouter
   openrouter --version   # should show X.Y.Z
   ```

### Local Release Dry-Run

```bash
bun run release:local   # builds all 5 binaries in bin/
ls -lh bin/
```

### Rollback

If a bad release is published:

1. Delete the GitHub release and tag
2. `npm unpublish openrouter-cli@X.Y.Z --force`
3. Revert the Homebrew formula PR

### Binary Naming Convention

| Platform | Output filename |
|----------|----------------|
| macOS arm64 | `openrouter-macos-arm64` |
| macOS x64 | `openrouter-macos-x64` |
| Linux x64 | `openrouter-linux-x64` |
| Linux arm64 | `openrouter-linux-arm64` |
| Windows x64 | `openrouter-windows-x64.exe` |

SHA256 checksums are published alongside each binary as `openrouter-<platform>.sha256`.
