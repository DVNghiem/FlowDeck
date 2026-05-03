#!/usr/bin/env node
// bin/flowdeck.js — FlowDeck CLI
// Usage: npx @dv.nghiem/flowdeck [--local] [--uninstall] [--help]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h") || args.includes("help")) {
  console.log(`
FlowDeck — structured planning and execution workflows for OpenCode

Usage:
  npx @dv.nghiem/flowdeck             Install FlowDeck globally (~/.config/opencode/)
  npx @dv.nghiem/flowdeck --local     Install to current project (.opencode/)
  npx @dv.nghiem/flowdeck --uninstall Remove FlowDeck from opencode.json
  npx @dv.nghiem/flowdeck --help      Show this help

Agents and skills are managed by the npm package — no manual copy needed.
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

const configFile = join(configDir, "opencode.json");

if (isUninstall) {
  console.log(`Uninstalling FlowDeck from: ${configDir}`);

  if (existsSync(configFile)) {
    try {
      const cfg = JSON.parse(readFileSync(configFile, "utf-8"));
      let changed = false;

      if (Array.isArray(cfg.plugin)) {
        const before = cfg.plugin.length;
        cfg.plugin = cfg.plugin.filter(
          (p) => p !== "@dv.nghiem/flowdeck" && !String(p).startsWith("@dv.nghiem/flowdeck@")
        );
        if (cfg.plugin.length < before) changed = true;
      }

      if (cfg.default_agent === "orchestrator") {
        delete cfg.default_agent;
        changed = true;
      }

      if (changed) {
        writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
        console.log("  ✓ Removed plugin from opencode.json");
      } else {
        console.log("  ✓ Plugin not found in opencode.json");
      }
    } catch { /* ignore parse errors */ }
  }

  console.log("✅ FlowDeck uninstalled from: " + configDir);
  console.log("   To reinstall: npx @dv.nghiem/flowdeck");
  process.exit(0);
}

// Install — register plugin in opencode.json
console.log(`Installing FlowDeck to: ${configDir}\n`);

mkdirSync(configDir, { recursive: true });

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
  console.log("  ✓ Added @dv.nghiem/flowdeck to plugin list");
} else {
  console.log("  ✓ Plugin already registered");
}

if (!cfg.default_agent) {
  cfg.default_agent = "orchestrator";
  console.log("  ✓ Set default_agent to orchestrator");
} else {
  console.log("  ✓ default_agent already set");
}

writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");

console.log(`\n✅ FlowDeck installed! Restart OpenCode to activate.`);
console.log(`   Config: ${configDir}`);