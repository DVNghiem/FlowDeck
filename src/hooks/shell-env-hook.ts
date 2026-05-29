/**
 * Shell Environment Hook
 * Injects project-aware environment variables into every bash tool execution.
 *
 * Injects:
 *   FLOWDECK_VERSION   — plugin version
 *   PROJECT_ROOT       — resolved worktree / directory
 *   PACKAGE_MANAGER    — detected from lockfiles
 *   DETECTED_LANGUAGES — comma-separated list detected from marker files
 *   PRIMARY_LANGUAGE   — first detected language
 *   FLOWDECK_PHASE     — current planning phase (if .planning/STATE.md exists)
 *
 * Inspired by ECC's shell.env hook.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { detectRtk } from "../services/rtk-manager"

// Pull version from package.json at startup (zero runtime overhead)
let _version: string | undefined
function getVersion(): string {
  if (_version) return _version
  try {
    const require = createRequire(import.meta.url)
    const pkg = require("../../package.json") as { version?: string }
    _version = pkg.version ?? "0.0.0"
  } catch {
    _version = "0.0.0"
  }
  return _version
}

const LOCKFILE_TO_PM: Record<string, string> = {
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
}

const MARKER_TO_LANG: Record<string, string> = {
  "tsconfig.json": "typescript",
  "go.mod": "go",
  "pyproject.toml": "python",
  "requirements.txt": "python",
  "Cargo.toml": "rust",
  "Package.swift": "swift",
  "build.gradle": "java",
  "pom.xml": "java",
  "CMakeLists.txt": "cpp",
  "Gemfile": "ruby",
}

function detectPackageManager(root: string): string | undefined {
  for (const [lockfile, pm] of Object.entries(LOCKFILE_TO_PM)) {
    if (existsSync(join(root, lockfile))) return pm
  }
  return undefined
}

function detectLanguages(root: string): string[] {
  const langs: string[] = []
  const seen = new Set<string>()
  for (const [marker, lang] of Object.entries(MARKER_TO_LANG)) {
    if (!seen.has(lang) && existsSync(join(root, marker))) {
      langs.push(lang)
      seen.add(lang)
    }
  }
  return langs
}

function readCurrentPhase(root: string): string | undefined {
  const statePath = join(root, ".planning", "STATE.md")
  if (!existsSync(statePath)) return undefined
  try {
    const content = readFileSync(statePath, "utf-8")
    const match = content.match(/phase:\s*(\S+)/i)
    return match?.[1]
  } catch {
    return undefined
  }
}

// Detect rtk once at hook creation time (startup cost only).
// The detection is cheap (a single spawnSync --version) and cached so every
// bash tool call does not re-detect.
let _rtkDetection: { installed: boolean; binPath?: string } | undefined

function getRtkDetection(): { installed: boolean; binPath?: string } {
  if (_rtkDetection !== undefined) return _rtkDetection
  try {
    const det = detectRtk()
    _rtkDetection = { installed: det.installed, binPath: det.binPath }
  } catch {
    _rtkDetection = { installed: false }
  }
  return _rtkDetection
}

export function createShellEnvHook(ctx: { directory: string; worktree?: string }) {
  const root = ctx.worktree || ctx.directory

  return async (_input: unknown, output: { env: Record<string, string> }) => {
    output.env.FLOWDECK_VERSION = getVersion()
    output.env.FLOWDECK_PLUGIN = "true"
    output.env.PROJECT_ROOT = root

    const pm = detectPackageManager(root)
    if (pm) output.env.PACKAGE_MANAGER = pm

    const langs = detectLanguages(root)
    if (langs.length > 0) {
      output.env.DETECTED_LANGUAGES = langs.join(",")
      output.env.PRIMARY_LANGUAGE = langs[0]
    }

    const phase = readCurrentPhase(root)
    if (phase) output.env.FLOWDECK_PHASE = phase

    // rtk: inject installed status and binary path for agent awareness.
    // RTK_TELEMETRY_DISABLED=1 blocks telemetry regardless of consent state,
    // providing belt-and-suspenders protection for every bash session.
    const rtk = getRtkDetection()
    output.env.RTK_INSTALLED = rtk.installed ? "true" : "false"
    if (rtk.installed && rtk.binPath) {
      output.env.RTK_BIN = rtk.binPath
    }
    if (rtk.installed) {
      output.env.RTK_TELEMETRY_DISABLED = "1"
    }
  }
}
