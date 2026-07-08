/**
 * Plugin Loader Service
 *
 * Orchestrates auto-update and lazy-loading of the real FlowDeck plugin
 * from the repo clone at `~/.local/share/flowdeck/`.
 *
 * All operations are wrapped in try/catch so the plugin always falls back
 * to the bundled copy — the loader NEVER blocks startup.
 */

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import type { Plugin } from "@opencode-ai/plugin"

const DEFAULT_INSTALL_DIR = join(homedir(), ".local", "share", "flowdeck")

const LOCK_FILE_NAME = ".update.lock"
const LOCK_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Conditional logger for flowdeck-loader messages.
 * Only prints to console when FLOWDECK_DEBUG is set,
 * keeping startup clean for regular users.
 */
export function logFlowDeck(...args: unknown[]): void {
  if (process.env.FLOWDECK_DEBUG) {
    console.warn("[flowdeck-loader]", ...args)
  }
}

/** Full path to the lock file for the given install directory. */
function lockFilePath(installDir: string): string {
  return join(installDir, LOCK_FILE_NAME)
}

/**
 * Validate a lock timestamp string against known-bad values.
 * Returns the parsed timestamp number if valid, or null if the content
 * is Infinity, NaN, a future timestamp, or a clearly prehistoric date.
 */
function validateLockTimestamp(content: string): number | null {
  const ts = Number(content)
  if (!isFinite(ts) || isNaN(ts)) return null
  if (ts > Date.now() + LOCK_MAX_AGE_MS) return null // future timestamp
  if (ts < 1_700_000_000_000) return null // before ~2023 — invalid
  return ts
}

/**
 * Acquire an advisory lock for coordinating git/build operations across
 * multiple OpenCode instances.
 *
 * Uses `mkdirSync` which is atomic on most filesystems — it succeeds only
 * once; concurrent callers get EEXIST.  This avoids the TOCTOU race
 * inherent in the old exists → read → unlink → write sequence.
 *
 * Returns `true` if the lock was acquired (caller should proceed with the
 * protected operation), `false` if another instance holds a recent lock
 * (caller should skip the operation).
 *
 * Stale locks older than LOCK_MAX_AGE_MS are cleaned up automatically
 * (crash recovery).
 */
export function acquireLock(installDir: string): boolean {
  const lockPath = lockFilePath(installDir)
  try {
    // Atomic directory creation — succeeds only once
    mkdirSync(lockPath, { recursive: false })
    // We got the lock — write a timestamp file inside
    writeFileSync(join(lockPath, "ts"), String(Date.now()), "utf-8")
    return true
  } catch (err: unknown) {
    const nodeErr = err as { code?: string }
    if (nodeErr.code === "EEXIST") {
      // Lock directory already exists — check if it is stale
      try {
        const tsPath = join(lockPath, "ts")
        if (existsSync(tsPath)) {
          const content = readFileSync(tsPath, "utf-8")
          const ts = validateLockTimestamp(content)
          if (ts !== null && Date.now() - ts < LOCK_MAX_AGE_MS) {
            // Lock is recent — another instance holds it
            return false
          }
        }
        // Lock is stale (or ts file missing / invalid) — remove and retry
        rmSync(lockPath, { recursive: true, force: true })
        mkdirSync(lockPath, { recursive: false })
        writeFileSync(join(lockPath, "ts"), String(Date.now()), "utf-8")
        return true
      } catch {
        // Fallback: proceed without locking
        return true
      }
    }
    // Other errors — proceed without locking
    return true
  }
}

/**
 * Release a lock held by the current instance.
 */
export function releaseLock(installDir: string): void {
  try {
    rmSync(lockFilePath(installDir), { recursive: true, force: true })
  } catch {
    // Non-fatal
  }
}

/** Resolve the install directory from env or default. */
export function getInstallDir(): string {
  const env = process.env.FLOWDECK_INSTALL_DIR

  if (!env) return DEFAULT_INSTALL_DIR

  try {
    const resolved = resolve(env)
    const home = homedir()
    if (!resolved.startsWith(home)) {
      console.warn(
        "[flowdeck-loader]",
        `FLOWDECK_INSTALL_DIR (${resolved}) is outside home directory — using default`,
      )
      return DEFAULT_INSTALL_DIR
    }
    return resolved
  } catch {
    console.warn("[flowdeck-loader]", "could not resolve FLOWDECK_INSTALL_DIR — using default")
  }

  return DEFAULT_INSTALL_DIR
}

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@dv.nghiem/flowdeck/latest"
const REPO_URL = "https://github.com/DVNghiem/FlowDeck.git"

/**
 * Resolve the repository URL from environment or default.
 * FLOWDECK_REPO_URL overrides the default GitHub URL for local
 * development and testing (e.g., file:/// or a local path).
 */
export function getRepoUrl(): string {
  return process.env.FLOWDECK_REPO_URL ?? REPO_URL
}

export interface LoaderResult {
  hooks: Awaited<ReturnType<Plugin>>
  updateApplied: boolean
  updateInfo?: { from: string; to: string }
}

/**
 * Check npm registry for latest version. Returns version info or null.
 */
export async function checkNpmRegistry(): Promise<{
  latest: string
  updateAvailable: boolean
  current: string
} | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2_000)
    const response = await fetch(NPM_REGISTRY_URL, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) return null

    const data = (await response.json()) as { version?: string }
    if (!data.version) return null

    const { createRequire } = await import("module")
    const require = createRequire(import.meta.url)
    const pkg = require("../../package.json") as { version?: string }
    const current = pkg.version ?? "0.0.0"

    const clean = (v: string) => v.split("-")[0].split(".").map(Number)
    const cv = clean(current)
    const lv = clean(data.version)
    const len = Math.max(cv.length, lv.length)

    let updateAvailable = false
    for (let i = 0; i < len; i++) {
      if ((cv[i] ?? 0) < (lv[i] ?? 0)) {
        updateAvailable = true
        break
      }
      if ((cv[i] ?? 0) > (lv[i] ?? 0)) break
    }

    return { latest: data.version, updateAvailable, current }
  } catch (e) {
    logFlowDeck("npm registry check failed:", (e as Error)?.message ?? "unknown")
    return null
  }
}

/**
 * Ensure the repo clone exists at getInstallDir().
 * Clones if missing, pulls if present.
 * Returns the install directory path.
 */
export function ensureRepoClone(): string {
  const installDir = getInstallDir()

  if (!acquireLock(installDir)) {
    logFlowDeck("another instance has the lock, skipping git pull")
    return installDir
  }

  try {
    if (existsSync(join(installDir, ".git"))) {
      // If FLOWDECK_REPO_URL is set, update origin to match
      const repoUrl = getRepoUrl()
      if (process.env.FLOWDECK_REPO_URL && repoUrl !== REPO_URL) {
        try {
          execFileSync("git", ["remote", "set-url", "origin", repoUrl], {
            cwd: installDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            timeout: 10_000,
          })
        } catch { /* non-fatal */ }
      }
      try {
        execFileSync("git", ["pull", "--quiet"], {
          cwd: installDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 30_000,
        })
        // Log the pulled commit hash
        try {
          const headHash = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: installDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            timeout: 10_000,
          }).trim()
          logFlowDeck("updated to commit", headHash.slice(0, 12))
        } catch { /* non-fatal */ }
      } catch (e) {
        logFlowDeck("git pull failed:", (e as Error)?.message ?? "unknown")
      }
    } else {
      mkdirSync(installDir, { recursive: true })
      try {
        execFileSync("git", ["clone", "--depth", "1", "--quiet", getRepoUrl(), installDir], {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 60_000,
        })
        // Log the cloned commit hash for audit trail
        try {
          const headHash = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: installDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            timeout: 10_000,
          }).trim()
          logFlowDeck("cloned at commit", headHash.slice(0, 12))
        } catch { /* non-fatal */ }
      } catch (e) {
        logFlowDeck("git clone failed:", (e as Error)?.message ?? "unknown")
      }
    }
  } finally {
    releaseLock(installDir)
  }

  return installDir
}

/**
 * Build the plugin in the repo clone. Non-fatal if build fails.
 */
export function buildPlugin(installDir: string): void {
  if (!acquireLock(installDir)) {
    logFlowDeck("another instance has the lock, skipping build")
    return
  }

  try {
    execFileSync("bun", ["run", "build"], {
      cwd: installDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 120_000,
    })
  } catch (e) {
    logFlowDeck("build failed:", (e as Error)?.message ?? "unknown")
  } finally {
    releaseLock(installDir)
  }
}

/**
 * Load and return the real plugin factory from the repo clone.
 * Returns null if loading fails.
 */
export async function loadPluginFromRepo(
  installDir: string,
): Promise<Plugin | null> {
  const pluginEntry = join(installDir, "dist", "plugin", "index.js")
  if (!existsSync(pluginEntry)) return null
  try {
    const pluginModule = await import(`file://${pluginEntry}`)
    const defaultExport = pluginModule.default ?? pluginModule
    if (typeof defaultExport !== "function") return null
    return defaultExport
  } catch (e) {
    logFlowDeck("load plugin from repo failed:", (e as Error)?.message ?? "unknown")
    return null
  }
}
