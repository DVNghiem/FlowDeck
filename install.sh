#!/usr/bin/env bash
# install.sh — Install FlowDeck agents/skills into OpenCode config dir
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

# Build dist/ if it's missing or stale
if [ ! -f "$SCRIPT_DIR/dist/index.js" ]; then
  info "dist/index.js not found — building..."
  cd "$SCRIPT_DIR" && bun run build
  cd - > /dev/null
fi

mkdir -p "$OPENCODE_DIR/agent" "$OPENCODE_DIR/skills"

# Install agents
agent_count=0
for f in "$SCRIPT_DIR/agents/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$OPENCODE_DIR/agent/$(basename "$f")"
  agent_count=$((agent_count + 1))
done
success "Installed $agent_count agents → $OPENCODE_DIR/agent/"

# Install skills
skill_count=0
for d in "$SCRIPT_DIR/skills/"/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  mkdir -p "$OPENCODE_DIR/skills/$name"
  cp -r "$d/." "$OPENCODE_DIR/skills/$name/"
  skill_count=$((skill_count + 1))
done
success "Installed $skill_count skills → $OPENCODE_DIR/skills/"

# Register plugin in opencode.json using node (available everywhere bun is)
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
  mkdirSync("${OPENCODE_DIR}", { recursive: true });
  writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\\n");
  console.log("[OK]   Registered @dv.nghiem/flowdeck in opencode.json");
} else {
  console.log("[OK]   @dv.nghiem/flowdeck already in opencode.json");
}
EOF

echo ""
success "FlowDeck installed to: $OPENCODE_DIR"
info   "Restart OpenCode to activate."
info   "To uninstall: bash $SCRIPT_DIR/uninstall.sh"
