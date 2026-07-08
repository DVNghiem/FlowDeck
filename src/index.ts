/**
 * FlowDeck Plugin — Auto-Update Loader
 *
 * Thin entry point that delegates to the repo clone at
 * `~/.local/share/flowdeck/dist/` after attempting to update and rebuild it.
 *
 * If the repo clone is unavailable or loading fails, falls back to the
 * bundled plugin at `./plugin/index.ts`.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { execFileSync } from "node:child_process"
import { createRequire } from "module"
import {
  ensureRepoClone,
  buildPlugin,
  loadPluginFromRepo,
  checkNpmRegistry,
  logFlowDeck,
} from "./services/plugin-loader"

const plugin: Plugin = async (input) => {
  // Phase 1: Update check + install (time-budgeted, non-blocking on failure)
  let pluginFactory: Plugin | null = null

  // In test environments, skip the update cycle to avoid side effects
  // (network calls, git operations, builds) and immediately delegate to
  // the bundled plugin. Tests that need to exercise the loader should
  // temporarily set NODE_ENV to "development" or similar.
  if (process.env.NODE_ENV === "test") {
    const { default: bundledPlugin } = await import("./plugin/index.js")
    return (bundledPlugin as Plugin)(input)
  }

  try {
    // Step 1: Check npm registry for updates
    const registryInfo = await checkNpmRegistry()

    // Step 2: If update available, run npm install @latest with correct cwd
    if (registryInfo?.updateAvailable) {
      try {
        const req = createRequire(import.meta.url)
        const pkgPath = req.resolve("@dv.nghiem/flowdeck/package.json")
        const targetDir = pkgPath.replace(/node_modules\/@dv\.nghiem\/flowdeck\/package\.json$/, "")
        execFileSync("npm", ["install", "--ignore-scripts", "@dv.nghiem/flowdeck@latest"], {
          cwd: targetDir || process.cwd(),
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 60_000,
        })
      } catch (e) {
        logFlowDeck("npm install failed:", (e as Error)?.message ?? "unknown")
      }
    }

    // Step 3: Ensure repo clone is up to date + built
    const installDir = ensureRepoClone()
    buildPlugin(installDir)

    // Step 4: Load plugin from repo clone
    pluginFactory = await loadPluginFromRepo(installDir)
  } catch (e) {
    logFlowDeck("update/load cycle failed:", (e as Error)?.message ?? "unknown")
  }

  // Phase 2: If repo plugin loaded, delegate to it
  if (pluginFactory) {
    return pluginFactory(input)
  }

  // Phase 3: Fallback — run the bundled plugin directly
  const { default: bundledPlugin } = await import("./plugin/index.js")
  return (bundledPlugin as Plugin)(input)
}

export default plugin
