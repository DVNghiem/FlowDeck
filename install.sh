#!/usr/bin/env bash
# install.sh — Install FlowDeck into OpenCode with selective profiles
# Usage:
#   bash install.sh                    # backward-compatible: register plugin only
#   bash install.sh --profile minimal  # install minimal profile
#   bash install.sh --profile developer --with plan-task --without ui-design
#   bash install.sh --list             # list available components
#   bash install.sh --check            # drift detection
#   bash install.sh --uninstall        # remove managed files
#   bash install.sh --local            # use local .opencode/ directory
set -euo pipefail

# ── version ──────────────────────────────────────────────────────────────────
VERSION="0.4.12"

# ── helpers ──────────────────────────────────────────────────────────────────
info()    { echo "[INFO] $*"; }
success() { echo "[OK]   $*"; }
warn()    { echo "[WARN] $*"; }
error()   { echo "[ERR]  $*" >&2; exit 1; }

# ── path resolution ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve FlowDeck source directory (local dev vs installed package)
if [ -d "$SCRIPT_DIR/src/rules" ] && [ -d "$SCRIPT_DIR/src/skills" ]; then
  FLOWDECK_SRC="$SCRIPT_DIR"
elif [ -d "$SCRIPT_DIR/../@dv.nghiem/flowdeck/src/rules" ]; then
  FLOWDECK_SRC="$SCRIPT_DIR/../@dv.nghiem/flowdeck"
else
  # Fallback: search upward for package.json with name @dv.nghiem/flowdeck
  CURR="$SCRIPT_DIR"
  while [ "$CURR" != "/" ]; do
    if [ -f "$CURR/package.json" ] && grep -q '"@dv.nghiem/flowdeck"' "$CURR/package.json" 2>/dev/null; then
      FLOWDECK_SRC="$CURR"
      break
    fi
    CURR="$(dirname "$CURR")"
  done
fi

if [ -z "${FLOWDECK_SRC:-}" ] || [ ! -d "$FLOWDECK_SRC/src/rules" ]; then
  error "Cannot find FlowDeck source directory (expected src/rules and src/skills)"
fi

# Resolve OpenCode config directory
IS_LOCAL=0
for arg in "$@"; do
  [ "$arg" = "--local" ] && IS_LOCAL=1
done

if [ "$IS_LOCAL" -eq 1 ]; then
  OPENCODE_DIR="$(pwd)/.opencode"
else
  OPENCODE_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
fi

# Managed paths
FLOWDECK_DIR="$OPENCODE_DIR/flowdeck"
INSTALL_STATE="$FLOWDECK_DIR/install-state.json"
FLOWDECK_CONFIG="$OPENCODE_DIR/flowdeck.json"
OPENCODE_JSON="$OPENCODE_DIR/opencode.json"

# ── CLI parsing
PROFILE=""
WITH_SKILLS=()
WITHOUT_SKILLS=()
DO_LIST=0
DO_CHECK=0
DO_UNINSTALL=0

# Collect all arguments first for duplicate flag handling
while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      shift
      [ $# -eq 0 ] && error "--profile requires an argument (minimal|developer|full)"
      PROFILE="$1"
      ;;
    --with)
      shift
      [ $# -eq 0 ] && error "--with requires a skill name"
      WITH_SKILLS+=("$1")
      ;;
    --without)
      shift
      [ $# -eq 0 ] && error "--without requires a skill name"
      WITHOUT_SKILLS+=("$1")
      ;;
    --list)
      DO_LIST=1
      ;;
    --check)
      DO_CHECK=1
      ;;
    --uninstall)
      DO_UNINSTALL=1
      ;;
    --local)
      # handled above
      ;;
    --help|-h)
      cat <<'HELP'
FlowDeck Installer

Usage: bash install.sh [OPTIONS]

Options:
  --profile minimal|developer|full   Install profile (default: developer)
  --with skill-name                  Include a specific skill
  --without skill-name               Exclude a specific skill
  --list                             List available rules and skills
  --check                            Drift detection against install state
  --uninstall                        Remove FlowDeck and managed files
  --local                            Use ./.opencode/ instead of global config
  --help                             Show this help

Profiles:
  minimal    Core rules only (behavioral, agent-orchestration)
  developer  Minimal + language-specific rules + all skills
  full       Everything

Examples:
  bash install.sh                          # register plugin only (backward compat)
  bash install.sh --profile developer      # full developer setup
  bash install.sh --profile minimal --with plan-task
  bash install.sh --list
  bash install.sh --check
  bash install.sh --uninstall
HELP
      exit 0
      ;;
    *)
      error "Unknown option: $1. Use --help for usage."
      ;;
  esac
  shift
done

# ── discover components ──────────────────────────────────────────────────────

discover_rules() {
  while IFS= read -r -d '' f; do
    local name
    name="$(basename "$f")"
    # skip README and non-.md files
    [ "$name" = "README.md" ] && continue
    # category is the parent directory name (e.g., common, typescript)
    local cat
    cat="$(basename "$(dirname "$f")")"
    printf '%s\t%s\t%s\n' "$cat" "$name" "$f"
  done < <(find "$FLOWDECK_SRC/src/rules" -name '*.md' -type f -print0 2>/dev/null || true)
}

discover_skills() {
  while IFS= read -r -d '' f; do
    local name
    name="$(basename "$(dirname "$f")")"
    printf '%s\t%s\n' "$name" "$f"
  done < <(find "$FLOWDECK_SRC/src/skills" -name 'SKILL.md' -type f -print0 2>/dev/null || true)
}

# ── language detection ───────────────────────────────────────────────────────

detect_languages() {
  local root="$(pwd)"
  local langs=()

  # Indicator files
  if [ -f "$root/package.json" ]; then
    if [ -f "$root/tsconfig.json" ] || \
       grep -q '"typescript"' "$root/package.json" 2>/dev/null || \
       grep -q '"@types/node"' "$root/package.json" 2>/dev/null; then
      langs+=("typescript")
    else
      langs+=("javascript")
    fi
  fi

  [ -f "$root/go.mod" ] && langs+=("go")
  [ -f "$root/Cargo.toml" ] && langs+=("rust")
  [ -f "$root/pom.xml" ] && langs+=("java")
  [ -f "$root/build.gradle" ] && langs+=("java")
  [ -f "$root/build.gradle.kts" ] && langs+=("java")
  [ -f "$root/requirements.txt" ] && langs+=("python")
  [ -f "$root/pyproject.toml" ] && langs+=("python")
  [ -f "$root/setup.py" ] && langs+=("python")

  # File extension fallback (only if no indicator files found)
  if [ ${#langs[@]} -eq 0 ]; then
    local counts=()
    local exts=("ts" "tsx" "js" "jsx" "py" "go" "rs" "java")
    for ext in "${exts[@]}"; do
      local n
      n="$(find "$root" -maxdepth 3 -name "*.$ext" -type f 2>/dev/null | wc -l)"
      counts+=("$n $ext")
    done

    # Pick languages with > 0 files
    for item in "${counts[@]}"; do
      local n ext
      n="${item%% *}"
      ext="${item##* }"
      if [ "$n" -gt 0 ]; then
        case "$ext" in
          ts|tsx)  [ " ${langs[*]} " != *" typescript "* ] && langs+=("typescript") ;;
          js|jsx)  [ " ${langs[*]} " != *" javascript "* ] && langs+=("javascript") ;;
          py)      langs+=("python") ;;
          go)      langs+=("go") ;;
          rs)      langs+=("rust") ;;
          java)    langs+=("java") ;;
        esac
      fi
    done
  fi

  printf '%s\n' "${langs[@]}" | sort -u | tr '\n' ' ' | sed 's/ $//'
}

# ── manifest building ────────────────────────────────────────────────────────

build_manifest() {
  local profile="${1:-developer}"
  local langs="${2:-}"

  # Base manifest arrays
  local rules=()
  local skills=()

  # Always include these common rules
  local common_rules=("behavioral.md" "agent-orchestration.md")

  case "$profile" in
    minimal)
      for r in "${common_rules[@]}"; do
        rules+=("common/$r")
      done
      ;;
    developer|full)
      for r in "${common_rules[@]}"; do
        rules+=("common/$r")
      done

      # Add language-specific rules
      if [ "$profile" = "developer" ] || [ "$profile" = "full" ]; then
        for lang in $langs; do
          local lang_file="$FLOWDECK_SRC/src/rules/$lang/patterns.md"
          if [ -f "$lang_file" ]; then
            rules+=("$lang/patterns.md")
          fi
        done
      fi

      # Full profile: add ALL rules
      if [ "$profile" = "full" ]; then
        while IFS=$'\t' read -r cat name path; do
          local key="$cat/$name"
          # avoid duplicates
          local found=0
          for existing in "${rules[@]}"; do
            [ "$existing" = "$key" ] && found=1 && break
          done
          [ "$found" -eq 0 ] && rules+=("$key")
        done < <(discover_rules)
      fi

      # Add skills (all for developer/full, then apply with/without overrides)
      while IFS=$'\t' read -r name path; do
        skills+=("$name")
      done < <(discover_skills)
      ;;
  esac

  # Apply --with / --without overrides (only affect skills for now)
  for w in "${WITH_SKILLS[@]}"; do
    local found=0
    for s in "${skills[@]}"; do
      [ "$s" = "$w" ] && found=1 && break
    done
    [ "$found" -eq 0 ] && skills+=("$w")
  done

  for wo in "${WITHOUT_SKILLS[@]}"; do
    local new_skills=()
    for s in "${skills[@]}"; do
      [ "$s" != "$wo" ] && new_skills+=("$s")
    done
    skills=("${new_skills[@]}")
  done

  # Output manifest as tab-separated lines: type\tkey
  for r in "${rules[@]}"; do
    printf 'rule\t%s\n' "$r"
  done
  for s in "${skills[@]}"; do
    printf 'skill\t%s\n' "$s"
  done | sort -u
}

# ── list mode ────────────────────────────────────────────────────────────────

if [ "$DO_LIST" -eq 1 ]; then
  echo "=== FlowDeck Components ==="
  echo ""
  echo "Rules:"
  while IFS=$'\t' read -r cat name path; do
    printf '  %-12s %s\n' "[$cat]" "$name"
  done < <(discover_rules | sort)

  echo ""
  echo "Skills:"
  while IFS=$'\t' read -r name path; do
    printf '  %s\n' "$name"
  done < <(discover_skills | sort)

  echo ""
  echo "Detected languages: $(detect_languages)"
  exit 0
fi

# ── uninstall mode ───────────────────────────────────────────────────────────

if [ "$DO_UNINSTALL" -eq 1 ]; then
  info "Uninstalling FlowDeck from: $OPENCODE_DIR"

  if [ ! -d "$OPENCODE_DIR" ]; then
    warn "OpenCode directory not found at $OPENCODE_DIR"
    exit 0
  fi

  # Remove plugin from opencode.json
  if [ -f "$OPENCODE_JSON" ]; then
    node --input-type=module <<EOF
import { readFileSync, writeFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync("${OPENCODE_JSON}", "utf-8"));
let changed = false;
if (Array.isArray(cfg.plugin)) {
  const before = cfg.plugin.length;
  cfg.plugin = cfg.plugin.filter(p => p !== "@dv.nghiem/flowdeck" && !String(p).startsWith("@dv.nghiem/flowdeck"));
  if (cfg.plugin.length < before) changed = true;
}
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

  # Remove flowdeck config and state
  if [ -f "$FLOWDECK_CONFIG" ]; then
    rm -f "$FLOWDECK_CONFIG"
    info "Removed $FLOWDECK_CONFIG"
  fi

  if [ -f "$INSTALL_STATE" ]; then
    rm -f "$INSTALL_STATE"
    info "Removed $INSTALL_STATE"
  fi

  # Remove empty flowdeck directory
  if [ -d "$FLOWDECK_DIR" ] && [ -z "$(ls -A "$FLOWDECK_DIR" 2>/dev/null)" ]; then
    rmdir "$FLOWDECK_DIR"
    info "Removed empty $FLOWDECK_DIR"
  fi

  echo ""
  success "FlowDeck uninstalled from: $OPENCODE_DIR"
  info "To reinstall: bash install.sh"
  exit 0
fi

# ── check mode (drift detection) ─────────────────────────────────────────────

if [ "$DO_CHECK" -eq 1 ]; then
  if [ ! -f "$INSTALL_STATE" ]; then
    warn "No install state found at $INSTALL_STATE"
    warn "Run: bash install.sh --profile <profile> to install"
    exit 1
  fi

  info "Checking install state against manifest..."

  # Read previous state
  prev_profile="$(node -e "const s=require('${INSTALL_STATE}'); console.log(s.profile||'')" 2>/dev/null || echo "")"
  prev_version="$(node -e "const s=require('${INSTALL_STATE}'); console.log(s.version||'')" 2>/dev/null || echo "")"

  if [ -z "$prev_profile" ]; then
    error "Install state is corrupted or unreadable"
  fi

  current_langs="$(detect_languages)"

  # Build current manifest
  current_manifest="$(build_manifest "$prev_profile" "$current_langs")"

  # Compare
  prev_manifest="$(node -e "
const s = require('${INSTALL_STATE}');
(s.rules || []).forEach(r => console.log('rule\\t' + r));
(s.skills || []).forEach(s => console.log('skill\\t' + s));
" 2>/dev/null | sort)"

  current_manifest="$(echo "$current_manifest" | sort)"

  if [ "$prev_manifest" = "$current_manifest" ] && [ "$prev_version" = "$VERSION" ]; then
    success "Install state matches manifest (profile: $prev_profile, version: $prev_version)"
    exit 0
  else
    warn "Drift detected!"
    [ "$prev_version" != "$VERSION" ] && warn "Version mismatch: installed=$prev_version current=$VERSION"

    # Show differences
    added="$(comm -23 <(echo "$current_manifest") <(echo "$prev_manifest"))"
    removed="$(comm -13 <(echo "$current_manifest") <(echo "$prev_manifest"))"

    if [ -n "$added" ]; then
      echo ""
      echo "Added since install:"
      echo "$added" | while IFS=$'\t' read -r type key; do
        printf '  + %s: %s\n' "$type" "$key"
      done
    fi

    if [ -n "$removed" ]; then
      echo ""
      echo "Removed since install:"
      echo "$removed" | while IFS=$'\t' read -r type key; do
        printf '  - %s: %s\n' "$type" "$key"
      done
    fi

    echo ""
    info "Run 'bash install.sh --profile $prev_profile' to re-sync"
    exit 1
  fi
fi

# ── backward compatibility: no profile = register plugin only ────────────────

if [ -z "$PROFILE" ] && [ ${#WITH_SKILLS[@]} -eq 0 ] && [ ${#WITHOUT_SKILLS[@]} -eq 0 ]; then
  # Just register plugin — exact behavior of original install.sh
  mkdir -p "$OPENCODE_DIR"

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
writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
console.log("[OK]   Registered @dv.nghiem/flowdeck in opencode.json");
EOF

  echo ""
  success "FlowDeck installed to: $OPENCODE_DIR"
  info   "Restart OpenCode to activate."
  info   "To uninstall: bash $SCRIPT_DIR/uninstall.sh"
  exit 0
fi

# ── profile installation ─────────────────────────────────────────────────────

# Default profile if not specified
if [ -z "$PROFILE" ]; then
  PROFILE="developer"
fi

# Validate profile
 case "$PROFILE" in
   minimal|developer|full)
     ;;
   *)
     error "Invalid profile: $PROFILE. Must be one of: minimal, developer, full"
     ;;
 esac

info "Installing FlowDeck profile: $PROFILE"
info "Source: $FLOWDECK_SRC"
info "Target: $OPENCODE_DIR"

# Idempotency check
if [ -f "$INSTALL_STATE" ]; then
  prev_profile="$(node -e "const s=require('${INSTALL_STATE}'); console.log(s.profile||'')" 2>/dev/null || echo "")"
  if [ "$prev_profile" = "$PROFILE" ] && [ ${#WITH_SKILLS[@]} -eq 0 ] && [ ${#WITHOUT_SKILLS[@]} -eq 0 ]; then
    info "Profile '$PROFILE' already installed. Run with --check for drift detection."
    info "Use --uninstall first to force re-installation."
    exit 0
  fi
fi

# Detect languages
DETECTED_LANGS="$(detect_languages)"
info "Detected languages: ${DETECTED_LANGS:-none}"

# Build manifest
MANIFEST="$(build_manifest "$PROFILE" "$DETECTED_LANGS")"
RULES=()
SKILLS=()
while IFS=$'\t' read -r type key; do
  case "$type" in
    rule) RULES+=("$key") ;;
    skill) SKILLS+=("$key") ;;
  esac
done <<< "$MANIFEST"

info "Selected ${#RULES[@]} rules, ${#SKILLS[@]} skills"

# Ensure directories exist
mkdir -p "$FLOWDECK_DIR"

# Register plugin in opencode.json
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
writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
console.log("[OK]   Registered @dv.nghiem/flowdeck in opencode.json");
EOF

# Write FlowDeck config (for plugin to read profile/component selection)
node --input-type=module <<EOF
import { writeFileSync } from "node:fs";
const config = {
  profile: "${PROFILE}",
  rules: $(printf '%s\n' "${RULES[@]}" | node -e '
    const lines = require("fs").readFileSync(0, "utf-8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(lines));
  '),
  skills: $(printf '%s\n' "${SKILLS[@]}" | node -e '
    const lines = require("fs").readFileSync(0, "utf-8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(lines));
  '),
  languages: $(printf '%s\n' "$DETECTED_LANGS" | tr ' ' '\n' | node -e '
    const lines = require("fs").readFileSync(0, "utf-8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(lines));
  '),
};
writeFileSync("${FLOWDECK_CONFIG}", JSON.stringify(config, null, 2) + "\n");
console.log("[OK]   Wrote FlowDeck config: ${FLOWDECK_CONFIG}");
EOF

# Write install state
node --input-type=module <<EOF
import { writeFileSync } from "node:fs";
const state = {
  version: "${VERSION}",
  profile: "${PROFILE}",
  rules: $(printf '%s\n' "${RULES[@]}" | node -e '
    const lines = require("fs").readFileSync(0, "utf-8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(lines));
  '),
  skills: $(printf '%s\n' "${SKILLS[@]}" | node -e '
    const lines = require("fs").readFileSync(0, "utf-8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(lines));
  '),
  languages: $(printf '%s\n' "$DETECTED_LANGS" | tr ' ' '\n' | node -e '
    const lines = require("fs").readFileSync(0, "utf-8").trim().split("\n").filter(Boolean);
    console.log(JSON.stringify(lines));
  '),
  timestamp: new Date().toISOString(),
  source: "${FLOWDECK_SRC}",
};
writeFileSync("${INSTALL_STATE}", JSON.stringify(state, null, 2) + "\n");
console.log("[OK]   Wrote install state: ${INSTALL_STATE}");
EOF

# Summary
echo ""
success "FlowDeck installed with profile: $PROFILE"
echo ""
echo "  Rules (${#RULES[@]}):"
printf '    - %s\n' "${RULES[@]}"

if [ ${#SKILLS[@]} -gt 0 ]; then
  echo ""
  echo "  Skills (${#SKILLS[@]}):"
  printf '    - %s\n' "${SKILLS[@]}"
fi

echo ""
info "Restart OpenCode to activate."
info "To check for drift: bash install.sh --check"
info "To uninstall: bash install.sh --uninstall"
