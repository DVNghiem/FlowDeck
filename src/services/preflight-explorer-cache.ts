/**
 * Preflight Exploration Cache
 *
 * Caches exploration results keyed by repo metadata (git revision + package
 * manifest hash). Avoids repeated heavy sync IO across session starts.
 */

import { createHash } from "crypto"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { ExplorationResult, DerivedTaskContext } from "./preflight-explorer"
import { exploreRepo, deriveTaskContext } from "./preflight-explorer"

interface CacheEntry {
  key: string
  result: ExplorationResult
  derived: Map<string, DerivedTaskContext>
}

const cache = new Map<string, CacheEntry>()

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16)
}

function getCurrentRevision(dir: string): string {
  try {
    const { spawnSync } = require("child_process")
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf-8", timeout: 5000 })
    return result.status === 0 ? (result.stdout ?? "").trim() : ""
  } catch {
    return ""
  }
}

async function getManifestHash(dir: string): Promise<string> {
  const files = ["package.json", "package-lock.json", "bun.lock", "tsconfig.json", "Cargo.toml", "go.mod", "pyproject.toml"]
  const h = createHash("sha256")
  for (const file of files) {
    const p = join(dir, file)
    if (existsSync(p)) {
      try {
        h.update(readFileSync(p, "utf-8"))
      } catch {
        // ignore
      }
    }
  }
  return h.digest("hex").slice(0, 16)
}

export async function buildCacheKey(dir: string): Promise<string> {
  const revision = getCurrentRevision(dir)
  const manifestHash = await getManifestHash(dir)
  return `${revision}:${manifestHash}`
}

/**
 * Explore repo with metadata-based caching. Returns cached result when key matches.
 */
export async function exploreRepoCached(dir: string, taskDescription?: string): Promise<{ result: ExplorationResult; derived: DerivedTaskContext; cacheHit: boolean }> {
  const key = await buildCacheKey(dir)
  const cached = cache.get(key)
  if (cached) {
    const derived = cached.derived.get(taskDescription ?? "") ?? deriveTaskContext(taskDescription ?? "", cached.result, dir)
    return { result: cached.result, derived, cacheHit: true }
  }

  const result = exploreRepo(dir)
  const derived = deriveTaskContext(taskDescription ?? "", result, dir)
  const entry: CacheEntry = { key, result, derived: new Map([[taskDescription ?? "", derived]]) }
  cache.set(key, entry)
  return { result, derived, cacheHit: false }
}

export function clearExplorationCache(): void {
  cache.clear()
}

export function getExplorationCacheSize(): number {
  return cache.size
}
