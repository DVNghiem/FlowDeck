// postinstall.mjs
// Runs after `npm install flowdeck` to copy agents, skills, and
// commands into the OpenCode config directory and register the plugin.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIN_OPENCODE_VERSION = "1.4.0";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseVersion(version) {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
}

function versionMeetsMin(current, minimum) {
  const cur = parseVersion(current);
  const min = parseVersion(minimum);
  const len = Math.max(cur.length, min.length);
  for (let i = 0; i < len; i++) {
    if ((cur[i] ?? 0) > (min[i] ?? 0)) return true;
    if ((cur[i] ?? 0) < (min[i] ?? 0)) return false;
  }
  return true;
}

function checkOpenCodeVersion() {
  try {
    const out = execSync("opencode --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return { ok: versionMeetsMin(out, MIN_OPENCODE_VERSION), version: out };
  } catch {
    return { ok: true, version: null }; // opencode not on PATH yet — non-fatal
  }
}

function getOpenCodeConfigDir() {
  return (
    process.env.OPENCODE_CONFIG_DIR ||
    (process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "opencode")
      : join(homedir(), ".config", "opencode"))
  );
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

function registerPlugin(configDir, pluginName) {
  const configFile = join(configDir, "opencode.json");
  let cfg = {};
  if (existsSync(configFile)) {
    try {
      cfg = JSON.parse(readFileSync(configFile, "utf-8"));
    } catch {
      // malformed JSON — start fresh with existing content preserved as-is
    }
  }
  if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
  const alreadyIn = cfg.plugin.some(
    (p) => p === pluginName || (typeof p === "string" && p.startsWith(`${pluginName}@`))
  );
  if (!alreadyIn) {
    cfg.plugin.push(pluginName);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
    return true;
  }
  return false;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  // Version check (advisory only)
  const versionCheck = checkOpenCodeVersion();
  if (versionCheck.version && !versionCheck.ok) {
    console.warn(`⚠  @dv.nghiem/flowdeck requires OpenCode >= ${MIN_OPENCODE_VERSION}`);
    console.warn(`   Detected: ${versionCheck.version}`);
    console.warn(`   Please update OpenCode: https://opencode.ai/docs`);
  }

  const configDir = getOpenCodeConfigDir();
  const pkgRoot = __dirname;
  let installed = 0;

  // Agents → ~/.config/opencode/agent/
  const agentSrc = join(pkgRoot, "agents");
  const agentDest = join(configDir, "agent");
  if (existsSync(agentSrc)) {
    mkdirSync(agentDest, { recursive: true });
    for (const f of readdirSync(agentSrc)) {
      if (!f.endsWith(".md")) continue;
      copyFileSync(join(agentSrc, f), join(agentDest, f));
      installed++;
    }
    console.log(`✓ Installed ${readdirSync(agentSrc).filter((f) => f.endsWith(".md")).length} FlowDeck agents → ${agentDest}`);
  }

  // Skills → ~/.config/opencode/skills/
  const skillsSrc = join(pkgRoot, "skills");
  const skillsDest = join(configDir, "skills");
  if (existsSync(skillsSrc)) {
    mkdirSync(skillsDest, { recursive: true });
    let count = 0;
    for (const d of readdirSync(skillsSrc)) {
      const src = join(skillsSrc, d);
      if (statSync(src).isDirectory()) {
        copyDir(src, join(skillsDest, d));
        count++;
        installed++;
      }
    }
    console.log(`✓ Installed ${count} FlowDeck skills → ${skillsDest}`);
  }

  // Register plugin in opencode.json
  const added = registerPlugin(configDir, "@dv.nghiem/flowdeck");
  if (added) {
    console.log(`✓ Registered @dv.nghiem/flowdeck in ${join(configDir, "opencode.json")}`);
  } else {
    console.log(`✓ @dv.nghiem/flowdeck already registered in opencode.json`);
  }

  if (installed > 0) {
    console.log(`\n✅ FlowDeck ready! Restart OpenCode to activate.`);
  }
}

main();
