// postinstall.mjs
// Runs after `npm install @dv.nghiem/flowdeck`
// Only registers the plugin in opencode.json — agents/skills come from the npm package

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync, execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIN_OPENCODE_VERSION = "1.4.0";
const FDX_MANIFEST = join(__dirname, "crates", "fdx", "Cargo.toml");
const FDX_TARGET = join(__dirname, "crates", "fdx", "target", "release", "fdx");
const FDX_DEST_DIR = join(__dirname, "bin");
const FDX_DEST = join(FDX_DEST_DIR, "fdx");

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

function hasCargo() {
  try {
    execFileSync("cargo", ["--version"], { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function buildFdx() {
  if (!existsSync(FDX_MANIFEST)) {
    return { ok: false, error: `fdx manifest not found at ${FDX_MANIFEST}` };
  }
  try {
    execFileSync("cargo", ["build", "--release", "--manifest-path", "crates/fdx/Cargo.toml"], {
      cwd: __dirname,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
    });
    if (!existsSync(FDX_TARGET)) {
      return { ok: false, error: `fdx binary not found at ${FDX_TARGET} after build` };
    }
    mkdirSync(FDX_DEST_DIR, { recursive: true });
    copyFileSync(FDX_TARGET, FDX_DEST);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message || err) };
  }
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

  // Build fdx binary if cargo is available
  if (hasCargo()) {
    const build = buildFdx();
    if (build.ok) {
      console.log(`✅ fdx built successfully`);
    } else {
      console.warn(`⚠  fdx build failed: ${build.error}`);
      console.warn(`   fdx will not be available. Agents will fall back to native tools.`);
    }
  } else {
    console.warn(`⚠  cargo not found. fdx will not be available.`);
    console.warn(`   Install Rust or run: cargo build --release --manifest-path crates/fdx/Cargo.toml`);
    console.warn(`   Agents will fall back to native tools.`);
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