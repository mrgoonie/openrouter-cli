#!/usr/bin/env sh
# install.sh — curl | sh installer for openrouter-cli
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/openrouter/openrouter-cli/main/install.sh | sh
#
# Environment variables:
#   OPENROUTER_VERSION  — pin a specific version (e.g. v0.1.0); defaults to latest
#   PREFIX              — install prefix (default: /usr/local); binary goes to $PREFIX/bin/openrouter
#
# Exit codes: 0 = success, 1 = error

set -e

REPO="openrouter/openrouter-cli"
BINARY_NAME="openrouter"

# ---------------------------------------------------------------------------
# Detect OS
# ---------------------------------------------------------------------------
os="$(uname -s | tr 'A-Z' 'a-z')"
case "$os" in
  darwin) os="darwin" ;;
  linux)  os="linux"  ;;
  *)
    echo "ERROR: Unsupported operating system: $os" >&2
    echo "       Windows users: install via npm — npm i -g openrouter-cli" >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Detect architecture
# ---------------------------------------------------------------------------
arch="$(uname -m)"
case "$arch" in
  x86_64)          arch="x64"   ;;
  arm64 | aarch64) arch="arm64" ;;
  *)
    echo "ERROR: Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Resolve version
# ---------------------------------------------------------------------------
if [ -z "$OPENROUTER_VERSION" ]; then
  echo "Fetching latest release version..."
  OPENROUTER_VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | cut -d'"' -f4)"
  if [ -z "$OPENROUTER_VERSION" ]; then
    echo "ERROR: Could not determine latest version. Set OPENROUTER_VERSION env var manually." >&2
    exit 1
  fi
fi

version="${OPENROUTER_VERSION#v}"  # strip leading 'v'
tag="v${version}"

echo "Installing openrouter-cli ${tag} (${os}-${arch})..."

# ---------------------------------------------------------------------------
# Resolve install prefix
# ---------------------------------------------------------------------------
prefix="${PREFIX:-/usr/local}"
install_dir="${prefix}/bin"

# Fallback to ~/.local/bin if prefix is not writable
if [ ! -w "$prefix" ] || [ ! -w "$install_dir" ] 2>/dev/null; then
  install_dir="${HOME}/.local/bin"
  mkdir -p "$install_dir"
  echo "Note: ${prefix}/bin not writable — installing to ${install_dir}"
fi

# ---------------------------------------------------------------------------
# Set up temp directory with cleanup trap
# ---------------------------------------------------------------------------
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Download binary + checksums
# ---------------------------------------------------------------------------
binary_file="${BINARY_NAME}-${os}-${arch}"
base_url="https://github.com/${REPO}/releases/download/${tag}"

echo "Downloading ${binary_file}..."
curl -fsSL --progress-bar "${base_url}/${binary_file}" -o "${tmp_dir}/${binary_file}"

echo "Downloading checksums.txt..."
curl -fsSL "${base_url}/checksums.txt" -o "${tmp_dir}/checksums.txt"

# ---------------------------------------------------------------------------
# Verify SHA-256
# ---------------------------------------------------------------------------
cd "$tmp_dir"

# Extract expected hash for our binary
expected_hash="$(grep "  ${binary_file}$" checksums.txt | awk '{print $1}')"
if [ -z "$expected_hash" ]; then
  echo "ERROR: No checksum entry found for ${binary_file} in checksums.txt" >&2
  exit 1
fi

# Compute actual hash (support both shasum and sha256sum)
if command -v sha256sum > /dev/null 2>&1; then
  actual_hash="$(sha256sum "${binary_file}" | awk '{print $1}')"
elif command -v shasum > /dev/null 2>&1; then
  actual_hash="$(shasum -a 256 "${binary_file}" | awk '{print $1}')"
else
  echo "ERROR: Neither sha256sum nor shasum found. Cannot verify binary." >&2
  exit 1
fi

if [ "$actual_hash" != "$expected_hash" ]; then
  echo "ERROR: SHA-256 mismatch for ${binary_file}!" >&2
  echo "  Expected: ${expected_hash}" >&2
  echo "  Actual:   ${actual_hash}" >&2
  exit 1
fi

echo "SHA-256 verified."

# ---------------------------------------------------------------------------
# Install binary
# ---------------------------------------------------------------------------
cd - > /dev/null
install_path="${install_dir}/${BINARY_NAME}"

cp "${tmp_dir}/${binary_file}" "$install_path"
chmod +x "$install_path"

echo "Installed to ${install_path}"

# ---------------------------------------------------------------------------
# PATH hint
# ---------------------------------------------------------------------------
case ":${PATH}:" in
  *":${install_dir}:"*) ;;  # already in PATH
  *)
    echo ""
    echo "Add the following to your shell profile to use openrouter from any directory:"
    echo "  export PATH=\"${install_dir}:\$PATH\""
    ;;
esac

echo ""
"$install_path" --version || true
echo "Done! Run 'openrouter --help' to get started."
