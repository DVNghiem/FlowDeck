#!/usr/bin/env bash
# uninstall.sh — Remove FlowDeck from OpenCode
# Usage: bash uninstall.sh [--local]
set -euo pipefail

IS_LOCAL=0
for arg in "$@"; do
  [ "$arg" = "--local" ] && IS_LOCAL=1
done

if [ "$IS_LOCAL" -eq 1 ]; then
  OPENCODE_DIR="$PWD/.opencode"
else
  OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
fi

CACHE_GLOB="$HOME/.cache/opencode/packages/@dv.nghiem/flowdeck@*"

info()    { echo "[INFO] $*"; }
success() { echo "[OK]   $*"; }
warn()    { echo "[WARN] $*"; }

if [ ! -d "$OPENCODE_DIR" ]; then
  warn "OpenCode directory not found at $OPENCODE_DIR"
  exit 0
fi

info "Uninstalling FlowDeck from: $OPENCODE_DIR"

# Remove plugin from opencode.json
OPENCODE_JSON="$OPENCODE_DIR/opencode.json"
if [ -f "$OPENCODE_JSON" ]; then
  node --input-type=module <<EOF
import { readFileSync, writeFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync("${OPENCODE_JSON}", "utf-8"));
let changed = false;

// Remove from plugin list
if (Array.isArray(cfg.plugin)) {
  const before = cfg.plugin.length;
  cfg.plugin = cfg.plugin.filter(p => p !== "@dv.nghiem/flowdeck" && !p.startsWith("@dv.nghiem/flowdeck@"));
  if (cfg.plugin.length < before) changed = true;
}

// Remove default_agent if it points to orchestrator
if (cfg.default_agent === "orchestrator") {
  delete cfg.default_agent;
  changed = true;
}

if (changed) {
  writeFileSync("${OPENCODE_JSON}", JSON.stringify(cfg, null, 2) + "\n");
  console.log("[OK]   Updated opencode.json");
} else {
  console.log("[INFO] opencode.json unchanged");
}
EOF
fi

# Remove plugin cache directories (all versions)
for cache_dir in $CACHE_GLOB; do
  if [ -d "$cache_dir" ]; then
    rm -rf "$cache_dir"
    info "Removed cache: $(basename "$cache_dir")"
  fi
done 2>/dev/null || true

# Clean up backup files if they exist
backup_count=0
for bk in "$OPENCODE_DIR/agent/"*.md.bk "$OPENCODE_DIR/agent/"*.md.bak; do
  [ -f "$bk" ] && rm -f "$bk" && backup_count=$((backup_count + 1))
done
if [ $backup_count -gt 0 ]; then
  success "Removed $backup_count backup files"
fi

echo ""
success "FlowDeck uninstalled from: $OPENCODE_DIR"
info "To reinstall: bash install.sh"