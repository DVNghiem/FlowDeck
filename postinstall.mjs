// postinstall.mjs
// Runs after `npm install @dv.nghiem/flowdeck`
// Only registers the plugin in opencode.json — agents/skills come from the npm package

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
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
  const configFile = join(configDir, "opencode.json");

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
    console.log(`✓ Added @dv.nghiem/flowdeck to plugin list`);
  } else {
    console.log(`✓ Plugin already registered`);
  }

  if (!cfg.default_agent) {
    cfg.default_agent = "orchestrator";
    console.log(`✓ Set default_agent to orchestrator`);
  } else {
    console.log(`✓ default_agent already set`);
  }

  writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");

  console.log(`\n✅ FlowDeck ready! Restart OpenCode to activate.`);
  console.log(`   Config: ${configDir}`);
}

main();