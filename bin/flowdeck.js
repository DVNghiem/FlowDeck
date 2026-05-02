#!/usr/bin/env node
// bin/flowdeck.js — FlowDeck CLI
// Usage: npx @dv.nghiem/flowdeck [--global] [--local] [--uninstall] [--help]

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
FlowDeck — structured planning and execution workflows for OpenCode

Usage:
  npx @dv.nghiem/flowdeck             Install FlowDeck globally (~/.config/opencode/)
  npx @dv.nghiem/flowdeck --local     Install to current project (.opencode/)
  npx @dv.nghiem/flowdeck --uninstall Remove FlowDeck agents/skills/commands
  npx @dv.nghiem/flowdeck --help      Show this help

The plugin itself is registered in opencode.json and loaded automatically
by OpenCode from npm. This CLI installs the companion agents, skills, and
commands into your OpenCode config directory.
`);
  process.exit(0);
}

const isLocal = args.includes("--local");
const isUninstall = args.includes("--uninstall");

const configDir = isLocal
  ? join(process.cwd(), ".opencode")
  : process.env.OPENCODE_CONFIG_DIR ||
    (process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "opencode")
      : join(homedir(), ".config", "opencode"));

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

if (isUninstall) {
  console.log(`Removing FlowDeck files from: ${configDir}`);

  const agentSrc = join(pkgRoot, "agents");
  const agentDest = join(configDir, "agent");
  if (existsSync(agentSrc) && existsSync(agentDest)) {
    for (const f of readdirSync(agentSrc)) {
      const t = join(agentDest, f);
      if (existsSync(t)) { import("node:fs").then(({ unlinkSync }) => unlinkSync(t)); }
    }
  }

  // Remove plugin from opencode.json
  const configFile = join(configDir, "opencode.json");
  if (existsSync(configFile)) {
    try {
      const cfg = JSON.parse(readFileSync(configFile, "utf-8"));
      if (Array.isArray(cfg.plugin)) {
        cfg.plugin = cfg.plugin.filter(
          (p) => p !== "@dv.nghiem/flowdeck" && !String(p).startsWith("@dv.nghiem/flowdeck@")
        );
        writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
      }
    } catch { /* ignore parse errors */ }
  }

  console.log("✓ FlowDeck uninstalled.");
  process.exit(0);
}

// Install
console.log(`Installing FlowDeck to: ${configDir}\n`);

// Agents
const agentSrc = join(pkgRoot, "agents");
const agentDest = join(configDir, "agent");
mkdirSync(agentDest, { recursive: true });
let agentCount = 0;
if (existsSync(agentSrc)) {
  for (const f of readdirSync(agentSrc)) {
    if (!f.endsWith(".md")) continue;
    copyFileSync(join(agentSrc, f), join(agentDest, f));
    agentCount++;
  }
}
console.log(`  ✓ Installed ${agentCount} agents`);

// Skills
const skillsSrc = join(pkgRoot, "skills");
const skillsDest = join(configDir, "skills");
mkdirSync(skillsDest, { recursive: true });
let skillCount = 0;
if (existsSync(skillsSrc)) {
  for (const d of readdirSync(skillsSrc)) {
    const src = join(skillsSrc, d);
    if (statSync(src).isDirectory()) {
      copyDir(src, join(skillsDest, d));
      skillCount++;
    }
  }
}
console.log(`  ✓ Installed ${skillCount} skills`);

// Commands
const cmdSrc = join(pkgRoot, "commands");
const cmdDest = join(configDir, "command");
mkdirSync(cmdDest, { recursive: true });
let cmdCount = 0;
if (existsSync(cmdSrc)) {
  for (const f of readdirSync(cmdSrc)) {
    if (!f.endsWith(".md")) continue;
    copyFileSync(join(cmdSrc, f), join(cmdDest, f));
    cmdCount++;
  }
}
console.log(`  ✓ Installed ${cmdCount} commands`);

// Register in opencode.json
const configFile = join(configDir, "opencode.json");
let cfg = {};
if (existsSync(configFile)) {
  try { cfg = JSON.parse(readFileSync(configFile, "utf-8")); } catch { /* ignore */ }
}
if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
const already = cfg.plugin.some(
  (p) => p === "@dv.nghiem/flowdeck" || String(p).startsWith("@dv.nghiem/flowdeck@")
);
if (!already) {
  cfg.plugin.push("@dv.nghiem/flowdeck");
  writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`  ✓ Registered plugin in opencode.json`);
} else {
  console.log(`  ✓ Plugin already registered`);
}

console.log(`\n✅ FlowDeck installed! Restart OpenCode to activate.`);
console.log(`   Config: ${configDir}`);
