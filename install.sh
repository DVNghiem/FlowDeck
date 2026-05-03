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

# Register plugin in opencode.json
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
info   "Restart OpenCode to activate."
info   "To uninstall: bash $SCRIPT_DIR/uninstall.sh"