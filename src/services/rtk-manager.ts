/**
 * rtk-manager — runtime integration for https://github.com/rtk-ai/rtk
 *
 * rtk is a CLI proxy that compresses noisy terminal output (git, npm, test
 * runners, linters, docker, etc.) by 60-90% before it reaches the model
 * context. It works by prefixing supported commands: `rtk git status`.
 *
 * This manager provides:
 * - Detection of an installed rtk binary
 * - Optional agent-triggered initialization (rtk init -g)
 * - Status reporting for diagnostics
 * - wrapCommandArgs() for explicit wrapping in FlowDeck's own spawnSync calls
 *
 * DESIGN NOTES:
 * - No auto-install: downloading + executing a remote shell script is a
 *   supply-chain risk. Users install rtk manually; this plugin detects it.
 * - No startup mutation: init is agent-triggered via rtk-setup tool only.
 * - Live detection: no state cache that goes stale across machines/reinstalls.
 * - Bash hook caveat: `rtk init -g` writes to Claude Code / Copilot global
 *   config. Whether that hook fires in OpenCode's non-interactive bash sessions
 *   depends on the runtime. Explicit wrapping via wrapCommandArgs() is the
 *   reliable alternative.
 */

import { spawnSync } from "child_process"
import { existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { shouldWrapWithRtk } from "./rtk-policy"

export interface RtkDetection {
  installed: boolean
  binPath?: string
  version?: string
  error?: string
}

export interface RtkInitResult {
  success: boolean
  log: string
  telemetryDisabled: boolean
  error?: string
}

export interface RtkStatus {
  installed: boolean
  binPath?: string
  version?: string
  initAttempted: boolean
  initSuccess: boolean
  telemetryDisabled: boolean
  installInstructions?: string
}

const INSTALL_INSTRUCTIONS = [
  "rtk is not installed. To install it manually:",
  "  Linux/macOS: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
  "  Then add ~/.local/bin to your PATH if needed.",
  "After installation, call rtk-setup again to verify detection.",
].join("\n")

/** Paths to check for the rtk binary beyond PATH. */
const CANDIDATE_PATHS = [join(homedir(), ".local", "bin", "rtk"), "/usr/local/bin/rtk", "/usr/bin/rtk"]

/**
 * Locate and verify the rtk binary. Checks PATH first, then known install
 * locations. Returns the first working binary found.
 */
export function detectRtk(): RtkDetection {
  // Try PATH first
  const fromPath = spawnSync("rtk", ["--version"], { encoding: "utf-8", timeout: 5000 })
  if (fromPath.status === 0) {
    const version = (fromPath.stdout ?? "").trim().split("\n")[0] ?? ""
    return { installed: true, binPath: "rtk", version }
  }

  // Try well-known install locations
  for (const candidate of CANDIDATE_PATHS) {
    if (!existsSync(candidate)) continue
    const result = spawnSync(candidate, ["--version"], { encoding: "utf-8", timeout: 5000 })
    if (result.status === 0) {
      const version = (result.stdout ?? "").trim().split("\n")[0] ?? ""
      return { installed: true, binPath: candidate, version }
    }
  }

  return {
    installed: false,
    error: "rtk binary not found in PATH or known install locations",
  }
}

/**
 * Run `rtk init -g` to install the bash hook for Claude Code / Copilot,
 * then immediately run `rtk telemetry disable` to explicitly opt out.
 *
 * Telemetry is disabled by default per rtk docs, but we make it explicit
 * and persistent so consent is never accidentally given in future versions.
 * The `RTK_TELEMETRY_DISABLED=1` env var injected by shell-env-hook provides
 * an additional belt-and-suspenders block at the session level.
 *
 * Note on bash hook: `rtk init -g` writes to Claude Code / Copilot global
 * config. Whether that hook fires in OpenCode's non-interactive bash sessions
 * depends on the runtime configuration. Use `$RTK_BIN <cmd>` explicitly as
 * a reliable alternative when RTK_INSTALLED=true in the environment.
 */
export function initRtk(binPath: string): RtkInitResult {
  try {
    const result = spawnSync(binPath, ["init", "-g"], {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: "pipe",
    })
    if (result.status !== 0) {
      return {
        success: false,
        log: (result.stdout ?? "").trim(),
        telemetryDisabled: false,
        error: (result.stderr ?? "").trim() || `rtk init -g exited with code ${result.status}`,
      }
    }

    // Explicitly disable telemetry immediately after init.
    // rtk telemetry is disabled by default, but we opt out explicitly so it
    // cannot be accidentally enabled by a future rtk init prompt change.
    const telResult = spawnSync(binPath, ["telemetry", "disable"], {
      encoding: "utf-8",
      timeout: 10_000,
      stdio: "pipe",
    })

    return {
      success: true,
      log: [
        `[rtk] init -g succeeded: ${(result.stdout ?? "").trim()}`,
        `[rtk] telemetry disable: ${telResult.status === 0 ? "ok" : `failed (code ${telResult.status}) — ${(telResult.stderr ?? "").trim()}`}`,
      ]
        .filter(Boolean)
        .join("\n"),
      telemetryDisabled: telResult.status === 0,
    }
  } catch (err) {
    return { success: false, log: "", telemetryDisabled: false, error: String(err) }
  }
}

/**
 * Return current rtk status. Always performs a live detection check.
 */
export function getRtkStatus(opts?: { runInit?: boolean }): RtkStatus {
  const detection = detectRtk()
  if (!detection.installed) {
    return {
      installed: false,
      initAttempted: false,
      initSuccess: false,
      telemetryDisabled: false,
      installInstructions: INSTALL_INSTRUCTIONS,
    }
  }

  let initAttempted = false
  let initSuccess = false
  let telemetryDisabled = false

  if (opts?.runInit && detection.binPath) {
    initAttempted = true
    const initResult = initRtk(detection.binPath)
    initSuccess = initResult.success
    telemetryDisabled = initResult.telemetryDisabled
  }

  return {
    installed: true,
    binPath: detection.binPath,
    version: detection.version,
    initAttempted,
    initSuccess,
    telemetryDisabled,
  }
}

/**
 * Wrap a command with rtk if the binary is available and policy allows it.
 * Returns `[cmd, ...args]` unchanged when rtk is unavailable or policy says no.
 *
 * Usage:
 *   const [c, ...a] = wrapCommandArgs("git", ["status"], "/home/user/.local/bin/rtk")
 *   spawnSync(c, a, { ... })
 */
export function wrapCommandArgs(cmd: string, args: string[], binPath: string | undefined): [string, ...string[]] {
  if (!binPath) return [cmd, ...args]
  if (!shouldWrapWithRtk(cmd, args)) return [cmd, ...args]
  return [binPath, cmd, ...args]
}
