#!/usr/bin/env bash
# install.sh — Install FlowDeck into OpenCode
# Usage: bash install.sh [--local]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IS_LOCAL=0
for arg in "$@"; do
  [ "$arg" = "--local" ] && IS_LOCAL=1
done

if [ "$IS_LOCAL" -eq 1 ]; then
  OPENCODE_DIR="$(pwd)/.opencode"
else
  OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
fi

info()    { echo "[INFO] $*"; }
success() { echo "[OK]   $*"; }
warn()    { echo "[WARN] $*"; }
error()   { echo "[ERR]  $*" >&2; exit 1; }

# ── clone repo ───────────────────────────────────────────────────────────────

FLOWDECK_REPO_URL="https://github.com/DVNghiem/FlowDeck.git"
FLOWDECK_INSTALL_DIR="${FLOWDECK_INSTALL_DIR:-$HOME/.local/share/flowdeck}"

clone_repo() {
  if [ -d "$FLOWDECK_INSTALL_DIR/.git" ]; then
    info "FlowDeck repo already cloned at $FLOWDECK_INSTALL_DIR"
    info "Pulling latest changes..."
    git -C "$FLOWDECK_INSTALL_DIR" pull --quiet || warn "git pull failed, using existing code"
  else
    info "Cloning FlowDeck repo to $FLOWDECK_INSTALL_DIR..."
    mkdir -p "$(dirname "$FLOWDECK_INSTALL_DIR")"
    git clone --depth 1 --quiet "$FLOWDECK_REPO_URL" "$FLOWDECK_INSTALL_DIR" || {
      error "Failed to clone FlowDeck repo. Check your internet connection and git installation."
    }
  fi
}

clone_repo

# ── fdx install (must succeed before plugin registration) ────────────────────

install_fdx() {
  # Skip if FDX_SKIP is set
  if [ -n "${FDX_SKIP:-}" ]; then
    info "fdx install skipped (FDX_SKIP is set)"
    return 0
  fi

  # Already installed
  if command -v fdx >/dev/null 2>&1; then
    success "fdx already installed ($(fdx --version))"
    return 0
  fi

  # Check cargo
  if ! command -v cargo >/dev/null 2>&1; then
    if [ -n "${CI:-}" ] && [ "${FDX_AUTO_INSTALL:-}" != "1" ]; then
      error "cargo not found. Install Rust: https://rustup.rs"
    fi
    if [ "${FDX_AUTO_INSTALL:-}" = "1" ]; then
      info "Installing Rust via rustup..."
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
      export PATH="$HOME/.cargo/bin:$PATH"
    else
      printf "cargo not found. Install Rust via rustup? [y/N] "
      read -r answer
      if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
        error "fdx install aborted — cargo is required to build fdx"
      fi
      info "Installing Rust via rustup..."
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
      export PATH="$HOME/.cargo/bin:$PATH"
    fi
  fi

  # Build and install from cloned repo
  FDX_PATH="$FLOWDECK_INSTALL_DIR/crates/fdx"

  if [ ! -d "$FDX_PATH" ]; then
    error "crates/fdx not found at $FDX_PATH — cannot install fdx"
  fi

  info "Building fdx (this may take a minute on first build)..."
  cargo install --path "$FDX_PATH" --quiet
  success "fdx installed: $(fdx --version)"
}

install_fdx

# ── register plugin in opencode.json ─────────────────────────────────────────

OPENCODE_JSON="$OPENCODE_DIR/opencode.json"
node --input-type=module <<EOF
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const configFile = "${OPENCODE_JSON}";
let cfg = {};
if (existsSync(configFile)) {
  try { cfg = JSON.parse(readFileSync(configFile, "utf-8")); } catch {}
}
if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
const already = cfg.plugin.some(p => p === "flowdeck" || String(p).startsWith("@dv.nghiem/flowdeck"));
if (!already) {
  cfg.plugin.push("@dv.nghiem/flowdeck");
}
if (!cfg.default_agent) {
  cfg.default_agent = "orchestrator";
}
mkdirSync("${OPENCODE_DIR}", { recursive: true });
writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\\n");
console.log("[OK]   Registered @dv.nghiem/flowdeck in opencode.json");
EOF

echo ""
success "FlowDeck installed to: $OPENCODE_DIR"
info   "Source code: $FLOWDECK_INSTALL_DIR"
info   "Restart OpenCode to activate."
info   "To uninstall: bash $FLOWDECK_INSTALL_DIR/uninstall.sh"
