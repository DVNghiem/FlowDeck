/**
 * Prompt Cache Service
 *
 * File-backed SHA-256 keyed cache for read-only agent responses.
 * Only caches agents that are EXPLICITLY idempotent and read-only.
 * Cache key includes: agent + normalized prompt + context + STATE summaryVersion + index summaryVersion.
 * This ensures the cache is invalidated automatically when state changes.
 *
 * SAFETY CONTRACT:
 * - Only cache agents in CACHEABLE_AGENTS set
 * - Callers must pass safe_to_cache: true explicitly
 * - Never cache coder/tester/devops/writer agents
 * - Never cache agents that create side effects (file writes, commands)
 */
import { createHash } from "crypto"
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"

/** Agents that are safe to cache — pure read-only / idempotent analysis. */
export const CACHEABLE_AGENTS = new Set([
  "researcher",
  "code-explorer",
  "reviewer",
  "plan-checker",
  "security-auditor",
  "question-guard",
  "quick-router",
])

const CACHE_DIR_NAME = "prompt-cache"
const MAX_CACHE_ENTRIES = 200
const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 minutes

export interface CacheEntry {
  key: string
  agent: string
  state_version: number
  index_version: number
  created_at: string
  ttl_ms: number
  response: string
}

export interface CacheStats {
  total_entries: number
  valid_entries: number
  expired_entries: number
  cache_size_bytes: number
}

function cacheDir(dir: string): string {
  return join(codebaseDir(dir), CACHE_DIR_NAME)
}

function entryPath(dir: string, key: string): string {
  return join(cacheDir(dir), `${key}.json`)
}

export function hashKey(
  agent: string,
  prompt: string,
  context: string,
  stateVersion: number,
  indexVersion: number,
): string {
  const raw = JSON.stringify({ agent, prompt: prompt.trim(), context: context.trim(), stateVersion, indexVersion })
  return createHash("sha256").update(raw).digest("hex").slice(0, 32)
}

/**
 * Retrieve a cached response.
 *
 * Returns null when:
 * - Agent is not in CACHEABLE_AGENTS
 * - No entry exists
 * - Entry is expired
 * - stateVersion or indexVersion don't match (state changed since cached)
 */
export function getCached(
  dir: string,
  agent: string,
  prompt: string,
  context: string,
  stateVersion: number,
  indexVersion: number,
  safe_to_cache = false,
): string | null {
  if (!safe_to_cache) return null
  if (!CACHEABLE_AGENTS.has(agent)) return null

  const key = hashKey(agent, prompt, context, stateVersion, indexVersion)
  const path = entryPath(dir, key)
  if (!existsSync(path)) return null

  try {
    const entry = JSON.parse(readFileSync(path, "utf-8")) as CacheEntry
    const age = Date.now() - new Date(entry.created_at).getTime()
    if (age > entry.ttl_ms) return null
    // Double-check versions even though they're part of the key (defence-in-depth)
    if (entry.state_version !== stateVersion || entry.index_version !== indexVersion) return null
    return entry.response
  } catch {
    return null
  }
}

/**
 * Store a response in the cache.
 *
 * No-ops silently when:
 * - safe_to_cache is false
 * - Agent is not in CACHEABLE_AGENTS
 */
export function setCached(
  dir: string,
  agent: string,
  prompt: string,
  context: string,
  stateVersion: number,
  indexVersion: number,
  response: string,
  safe_to_cache = false,
  ttl_ms = DEFAULT_TTL_MS,
): void {
  if (!safe_to_cache) return
  if (!CACHEABLE_AGENTS.has(agent)) return

  const cd = cacheDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })

  const key = hashKey(agent, prompt, context, stateVersion, indexVersion)
  const entry: CacheEntry = {
    key,
    agent,
    state_version: stateVersion,
    index_version: indexVersion,
    created_at: new Date().toISOString(),
    ttl_ms,
    response,
  }

  writeFileSync(entryPath(dir, key), JSON.stringify(entry, null, 2), "utf-8")

  // Prune old entries if we're over the limit
  pruneExpired(dir)
}

/**
 * Remove expired entries and trim to MAX_CACHE_ENTRIES.
 * Called automatically on setCached.
 */
export function pruneExpired(dir: string): void {
  const cd = cacheDir(dir)
  if (!existsSync(cd)) return

  try {
    const files = readdirSync(cd).filter(f => f.endsWith(".json"))
    const now = Date.now()

    const entries: { path: string; created_at: number; expired: boolean }[] = []
    for (const f of files) {
      const p = join(cd, f)
      try {
        const entry = JSON.parse(readFileSync(p, "utf-8")) as CacheEntry
        const age = now - new Date(entry.created_at).getTime()
        entries.push({ path: p, created_at: new Date(entry.created_at).getTime(), expired: age > entry.ttl_ms })
      } catch {
        entries.push({ path: p, created_at: 0, expired: true })
      }
    }

    // Delete expired
    let deleted = 0
    for (const e of entries) {
      if (e.expired) {
        try { require("fs").unlinkSync(e.path) } catch { /* ignore */ }
        deleted++
      }
    }

    // If still over limit, delete oldest valid entries
    const valid = entries.filter(e => !e.expired).sort((a, b) => a.created_at - b.created_at)
    const excess = valid.length - MAX_CACHE_ENTRIES
    for (let i = 0; i < excess; i++) {
      try { require("fs").unlinkSync(valid[i].path) } catch { /* ignore */ }
    }
  } catch {
    // Non-fatal: cache pruning failure is OK
  }
}

export function getCacheStats(dir: string): CacheStats {
  const cd = cacheDir(dir)
  if (!existsSync(cd)) {
    return { total_entries: 0, valid_entries: 0, expired_entries: 0, cache_size_bytes: 0 }
  }

  try {
    const files = readdirSync(cd).filter(f => f.endsWith(".json"))
    const now = Date.now()
    let valid = 0, expired = 0, size = 0

    for (const f of files) {
      const p = join(cd, f)
      try {
        const st = statSync(p)
        size += st.size
        const entry = JSON.parse(readFileSync(p, "utf-8")) as CacheEntry
        const age = now - new Date(entry.created_at).getTime()
        if (age > entry.ttl_ms) expired++
        else valid++
      } catch {
        expired++
      }
    }

    return { total_entries: files.length, valid_entries: valid, expired_entries: expired, cache_size_bytes: size }
  } catch {
    return { total_entries: 0, valid_entries: 0, expired_entries: 0, cache_size_bytes: 0 }
  }
}

/** Force-invalidate all cache entries for a given directory (call after state writes). */
export function invalidateCache(dir: string): void {
  const cd = cacheDir(dir)
  if (!existsSync(cd)) return
  try {
    for (const f of readdirSync(cd).filter(f => f.endsWith(".json"))) {
      try { require("fs").unlinkSync(join(cd, f)) } catch { /* ignore */ }
    }
  } catch { /* non-fatal */ }
}
