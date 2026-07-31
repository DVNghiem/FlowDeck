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

get_expected_fdx_version() {
  # Prefer current project (may have uncommitted version bumps), fall back to clone
  local cargo_toml
  if [ -f "./crates/fdx/Cargo.toml" ]; then
    cargo_toml="./crates/fdx/Cargo.toml"
  else
    cargo_toml="$FLOWDECK_INSTALL_DIR/crates/fdx/Cargo.toml"
  fi
  if [ -f "$cargo_toml" ]; then
    grep '^version' "$cargo_toml" | head -1 | sed 's/version[[:space:]]*=[[:space:]]*"\(.*\)"/\1/'
  fi
}

do_cargo_install() {
  local fdx_path="$1"
  if ! command -v cargo >/dev/null 2>&1; then
    export PATH="$HOME/.cargo/bin:$PATH"
  fi
  if ! command -v cargo >/dev/null 2>&1; then
    error "cargo not found. Install Rust: https://rustup.rs"
  fi
  info "Building fdx (this may take a minute)..."
  if cargo install --path "$fdx_path" --quiet; then
    local new_version
    new_version=$(fdx --version 2>/dev/null || echo "unknown")
    success "fdx installed/upgraded: $new_version"
  else
    error "fdx build failed. Check cargo output above."
  fi
}

install_fdx() {
  if [ -n "${FDX_SKIP:-}" ]; then
    info "fdx install skipped (FDX_SKIP is set)"
    return 0
  fi

  local fdx_path
  if [ -f "./crates/fdx/Cargo.toml" ]; then
    fdx_path="./crates/fdx"
  else
    fdx_path="$FLOWDECK_INSTALL_DIR/crates/fdx"
  fi

  if [ ! -d "$fdx_path" ]; then
    error "crates/fdx not found at $fdx_path — cannot install fdx"
  fi

  # ── Install Rust if cargo is missing ──────────────────────────────────────
  if ! command -v cargo >/dev/null 2>&1 && ! command -v "$HOME/.cargo/bin/cargo" >/dev/null 2>&1; then
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
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
      export PATH="$HOME/.cargo/bin:$PATH"
    fi
  fi

  # ── Version check ──────────────────────────────────────────────────────────
  local installed_version=""
  if command -v fdx >/dev/null 2>&1; then
    installed_version=$(fdx --version 2>/dev/null | sed 's/^fdx[[:space:]]*//' || echo "")
  fi

  local expected_version
  expected_version=$(get_expected_fdx_version)

  if [ -z "$installed_version" ]; then
    info "fdx not found — installing..."
    do_cargo_install "$fdx_path"
    return 0
  fi

  if [ -z "$expected_version" ] || [ "$installed_version" = "$expected_version" ]; then
    success "fdx already up to date ($installed_version)"
    return 0
  fi

  # ── Upgrade prompt ─────────────────────────────────────────────────────────
  info "fdx upgrade available: $installed_version → $expected_version"
  if [ -n "${CI:-}" ] || [ "${FDX_AUTO_UPGRADE:-}" = "1" ]; then
    info "Auto-upgrading (CI or FDX_AUTO_UPGRADE=1)"
    do_cargo_install "$fdx_path"
  else
    printf "Upgrade fdx %s → %s? [Y/n] " "$installed_version" "$expected_version"
    read -r answer
    case "${answer}" in
      n|N|no|NO) success "fdx upgrade skipped (staying on $installed_version)" ;;
      *)          do_cargo_install "$fdx_path" ;;
    esac
  fi
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
