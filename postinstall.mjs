// postinstall.mjs
// Runs after `npm install @dv.nghiem/flowdeck`
// Only registers the plugin in opencode.json — agents/skills come from the npm package

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync, execFileSync } from "node:child_process";
import { get as httpsGet } from "node:https";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIN_OPENCODE_VERSION = "1.4.0";
const FLOWDECK_REPO_URL = "https://github.com/DVNghiem/FlowDeck.git";
const FLOWDECK_INSTALL_DIR = process.env.FLOWDECK_INSTALL_DIR || join(homedir(), ".local", "share", "flowdeck");

// ── helpers ──────────────────────────────────────────────────────────────────

function parseVersion(version) {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
}

/**
 * Read the expected fdx version from crates/fdx/Cargo.toml.
 * Returns null if the file cannot be read.
 */
function getExpectedFdxVersion(fdxPath) {
  try {
    const cargoToml = readFileSync(join(fdxPath, "Cargo.toml"), "utf-8");
    const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Prompt user for upgrade confirmation. Returns true to upgrade, false to skip. */
async function promptUpgrade(installedVersion, expectedVersion) {
  if (process.env.CI || process.env.FDX_AUTO_UPGRADE === "1") {
    return true;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await Promise.race([
    new Promise((resolve) => {
      rl.question(
        `🔄 fdx upgrade: ${installedVersion} → ${expectedVersion}? [Y/n] `,
        (a) => resolve(a),
      );
    }),
    new Promise((resolve) => setTimeout(() => resolve("y"), 30_000)), // default yes after 30s
  ]);
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

/**
 * Run `cargo install --path <fdxPath>` and verify the result.
 * Returns true on success, false on failure (never throws).
 */
function doCargoInstall(fdxPath) {
  // Ensure ~/.cargo/bin is in PATH
  const cargoBin = join(homedir(), ".cargo", "bin");
  if (!process.env.PATH?.includes(cargoBin)) {
    process.env.PATH = `${cargoBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
  }

  console.log("Building fdx (this may take a minute)...");
  try {
    execSync("cargo install --path . --quiet", {
      cwd: fdxPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
    });
  } catch (err) {
    console.warn("⚠️  fdx build failed:");
    console.warn("   ", String(err.stderr || err.message || err).split("\n")[0]);
    return false;
  }

  try {
    const v = execSync("fdx --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
    console.log(`✅ fdx installed/upgraded: ${v}`);
  } catch {
    console.warn("⚠️  fdx installed but --version check failed");
  }
  return true;
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

// ── repo clone ───────────────────────────────────────────────────────────────

/**
 * Clone or update the FlowDeck repo to FLOWDECK_INSTALL_DIR.
 * Used when crates/fdx is not available locally (e.g., npm install).
 */
function cloneRepo() {
  if (existsSync(join(FLOWDECK_INSTALL_DIR, ".git"))) {
    console.log(`📥 FlowDeck repo already cloned at ${FLOWDECK_INSTALL_DIR}`);
    console.log("📥 Pulling latest changes...");
    try {
      execSync("git pull --quiet", {
        cwd: FLOWDECK_INSTALL_DIR,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 60_000,
      });
    } catch {
      console.warn("⚠️  git pull failed, using existing code");
    }
    return FLOWDECK_INSTALL_DIR;
  }

  console.log(`📥 Cloning FlowDeck repo to ${FLOWDECK_INSTALL_DIR}...`);
  try {
    mkdirSync(dirname(FLOWDECK_INSTALL_DIR), { recursive: true });
    execSync(`git clone --depth 1 --quiet "${FLOWDECK_REPO_URL}" "${FLOWDECK_INSTALL_DIR}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
    return FLOWDECK_INSTALL_DIR;
  } catch (err) {
    console.warn("⚠️  Failed to clone FlowDeck repo:", String(err.stderr || err.message || err).split("\n")[0]);
    return null;
  }
}

// ── fdx install ──────────────────────────────────────────────────────────────

/**
 * Install the fdx Rust CLI via cargo install.
 *
 * Decision tree:
 * 1. FDX_SKIP set? → skip
 * 2. fdx already in PATH? → done
 * 3. Resolve fdx source: local crates/fdx or clone repo
 * 4. cargo in PATH? → build (step 5)
 * 5. No cargo → offer rustup install
 * 6. cargo install --path crates/fdx
 * 7. Verify with fdx --version
 *
 * Never throws. All errors are warnings. fdx is optional.
 */
async function installFdx() {
  // Step 0: skip flag
  if (process.env.FDX_SKIP === "1") {
    console.log("⏭  fdx install skipped (FDX_SKIP=1)");
    return;
  }

  // Step 1: resolve fdx source path (needed early for version check)
  let fdxPath = join(__dirname, "crates", "fdx");
  if (!existsSync(fdxPath)) {
    const clonedDir = cloneRepo();
    if (clonedDir) {
      fdxPath = join(clonedDir, "crates", "fdx");
    } else {
      console.warn("⚠️  crates/fdx not found and repo clone failed — skipping fdx install");
      return;
    }
  }
  if (!existsSync(fdxPath)) {
    console.warn(`⚠️  crates/fdx not found at ${fdxPath} — skipping fdx install`);
    return;
  }

  // Step 2: check installed version vs expected
  let installedVersion = null;
  try {
    installedVersion = execSync("fdx --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 10_000,
    }).trim().replace(/^fdx\s+/i, "");
  } catch {
    // not installed — proceed to full install
  }

  const expectedVersion = getExpectedFdxVersion(fdxPath);

  if (installedVersion) {
    if (!expectedVersion || installedVersion === expectedVersion) {
      console.log(`✅ fdx already up to date (${installedVersion})`);
      return;
    }

    // Upgrade needed
    const isCI = process.env.CI === "true" || process.env.CI === "1";
    const autoUpgrade = process.env.FDX_AUTO_UPGRADE === "1";

    if (isCI || autoUpgrade) {
      console.log("Auto-upgrading (CI or FDX_AUTO_UPGRADE=1)");
      doCargoInstall(fdxPath);
      return;
    }

    // Interactive prompt
    const shouldUpgrade = await promptUpgrade(installedVersion, expectedVersion);
    if (!shouldUpgrade) {
      console.log(`⏭  fdx upgrade skipped (staying on ${installedVersion})`);
      return;
    }

    doCargoInstall(fdxPath);
    return;
  }

  // Not installed at all — fall through to cargo availability check + install
  const cargoBin = join(homedir(), ".cargo", "bin");
  if (!process.env.PATH?.includes(cargoBin)) {
    process.env.PATH = `${cargoBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
  }

  let hasCargo = false;
  try {
    execSync("cargo --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 10_000,
    });
    hasCargo = true;
  } catch {
    hasCargo = false;
  }

  if (!hasCargo) {
    const isCI = process.env.CI === "true" || process.env.CI === "1";
    const noPrompt = process.env.FDX_NO_PROMPT === "1";
    const autoInstall = process.env.FDX_AUTO_INSTALL === "1";

    if ((isCI || noPrompt) && !autoInstall) {
      console.warn(
        "⚠️  cargo not found. Set FDX_AUTO_INSTALL=1 to install Rust automatically, or install manually: https://rustup.rs"
      );
      return;
    }

    if (!autoInstall && !isCI && !noPrompt) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await Promise.race([
        new Promise((resolve) => {
          rl.question("cargo not found. Install Rust via rustup? [y/N] ", (ans) => {
            resolve(ans.trim().toLowerCase());
          });
        }),
        new Promise((resolve) => setTimeout(() => resolve("n"), 30_000)),
      ]);
      rl.close();

      if (answer !== "y" && answer !== "yes") {
        console.warn("⚠️  Skipping fdx install");
        return;
      }
    }

    // Install rustup non-interactively
    console.log("Installing Rust via rustup...");

    if (process.platform === "win32") {
      const rustupExe = join(homedir(), ".rustup-init.exe");
      await new Promise((resolve, reject) => {
        const file = createWriteStream(rustupExe);
        httpsGet("https://win.rustup.rs/x86_64", (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve(undefined);
          });
        }).on("error", reject);
      });

      try {
        execSync(`"${rustupExe}" /S /NORESTART`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 300_000,
        });
      } finally {
        try { unlinkSync(rustupExe); } catch { /* ignore */ }
      }
    } else {
      try {
        execSync(
          "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path",
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], shell: true, timeout: 300_000 }
        );
      } catch (err) {
        console.warn("⚠️  rustup install failed:", String(err.stderr || err.message || err));
        console.warn("   Install Rust manually: https://rustup.rs");
        return;
      }
    }

    // Add cargo bin to PATH for this process
    process.env.PATH = `${cargoBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;

    try {
      execSync("cargo --version", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 10_000,
      });
    } catch {
      console.warn("⚠️  cargo still not available after rustup install");
      return;
    }
  }

  doCargoInstall(fdxPath);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Version check (advisory only)
  const versionCheck = checkOpenCodeVersion();
  if (versionCheck.version && !versionCheck.ok) {
    console.warn(`⚠  @dv.nghiem/flowdeck requires OpenCode >= ${MIN_OPENCODE_VERSION}`);
    console.warn(`   Detected: ${versionCheck.version}`);
    console.warn(`   Please update OpenCode: https://opencode.ai/docs`);
  }

  // Install fdx (optional, never fails npm install)
  await installFdx();

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

main().catch(() => {
  // Never fail npm install
  process.exit(0);
});
