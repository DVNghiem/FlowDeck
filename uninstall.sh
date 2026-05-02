#!/usr/bin/env bash
set -euo pipefail

is_local=false
if [[ "${1:-}" == "--local" ]]; then
  is_local=true
fi

if [ "$is_local" = true ]; then
  OPENCODE_DIR="$PWD/.opencode"
else
  OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
fi

CACHE_GLOB="$HOME/.cache/opencode/packages/@dv.nghiem/flowdeck@*"
PKG_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info()    { echo "$(tput setaf 4 2>/dev/null || true)[INFO]$(tput sgr0 2>/dev/null || true) $*"; }
success() { echo "$(tput setaf 2 2>/dev/null || true)[OK]$(tput sgr0 2>/dev/null || true) $*"; }
warn()    { echo "$(tput setaf 3 2>/dev/null || true)[WARN]$(tput sgr0 2>/dev/null || true) $*"; }

if [ ! -d "$OPENCODE_DIR" ]; then
  warn "OpenCode directory not found at $OPENCODE_DIR"
  exit 0
fi

info "Uninstalling FlowDeck from: $OPENCODE_DIR"

# Run the node-based uninstall logic (same logic as bin/flowdeck.js --uninstall)
node -e "
const fs = require('fs');
const path = require('path');

const configDir = '$OPENCODE_DIR';
const pkgRoot = '$PKG_ROOT';

let removedFiles = 0;
let removedDirs = 0;

// Remove Agents
const agentSrc = path.join(pkgRoot, 'agents');
const agentDest = path.join(configDir, 'agent');
if (fs.existsSync(agentSrc) && fs.existsSync(agentDest)) {
  for (const f of fs.readdirSync(agentSrc)) {
    if (!f.endsWith('.md')) continue;
    const t = path.join(agentDest, f);
    if (fs.existsSync(t)) {
      fs.unlinkSync(t);
      removedFiles++;
    }
  }
}

// Remove Commands (installed by older versions of FlowDeck)
const cmdSrc = path.join(pkgRoot, 'docs', 'commands');
const cmdDest = path.join(configDir, 'command');
if (fs.existsSync(cmdSrc) && fs.existsSync(cmdDest)) {
  for (const f of fs.readdirSync(cmdSrc)) {
    if (!f.endsWith('.md')) continue;
    const t = path.join(cmdDest, f);
    if (fs.existsSync(t)) {
      fs.unlinkSync(t);
      removedFiles++;
    }
  }
}

// Remove Skills
const skillsSrc = path.join(pkgRoot, 'skills');
const skillsDest = path.join(configDir, 'skills');
if (fs.existsSync(skillsSrc) && fs.existsSync(skillsDest)) {
  for (const d of fs.readdirSync(skillsSrc)) {
    const s = path.join(skillsSrc, d);
    if (fs.statSync(s).isDirectory()) {
      const t = path.join(skillsDest, d);
      if (fs.existsSync(t)) {
        fs.rmSync(t, { recursive: true, force: true });
        removedDirs++;
      }
    }
  }
}

console.log('[OK] Removed ' + removedFiles + ' files and ' + removedDirs + ' skill directories');

// Remove plugin from opencode.json
const configFile = path.join(configDir, 'opencode.json');
if (fs.existsSync(configFile)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    let changed = false;
    if (Array.isArray(cfg.plugin)) {
      const before = cfg.plugin.length;
      cfg.plugin = cfg.plugin.filter(p => p !== '@dv.nghiem/flowdeck' && !p.startsWith('@dv.nghiem/flowdeck@'));
      if (cfg.plugin.length < before) {
        changed = true;
        console.log('[OK] Removed @dv.nghiem/flowdeck from plugin list');
      } else {
        console.log('[INFO] @dv.nghiem/flowdeck was not in plugin list');
      }
    }
    if (cfg.default_agent === 'orchestrator') {
      delete cfg.default_agent;
      changed = true;
      console.log('[OK] Removed default_agent from opencode.json');
    }
    if (changed) {
      fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + '\n');
    }
  } catch(e) { /* ignore parse errors */ }
}
"

# Remove plugin cache directories (all versions)
for cache_dir in $CACHE_GLOB; do
  if [ -d "$cache_dir" ]; then
    rm -rf "$cache_dir"
    info "Removed cache: $(basename "$cache_dir")"
  fi
done 2>/dev/null || true

success "FlowDeck uninstalled successfully."
