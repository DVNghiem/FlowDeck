/**
 * Prompt Cache Tests
 *
 * Covers:
 * - hashKey: deterministic for same inputs
 * - hashKey: changes when any field changes
 * - getCached/setCached: basic round-trip
 * - getCached: returns null when safe_to_cache=false
 * - getCached: returns null for non-cacheable agents
 * - getCached: returns null when state_version has changed
 * - getCached: returns null when index_version has changed
 * - setCached: does not write when safe_to_cache=false
 * - setCached: does not write for non-cacheable agents
 * - pruneExpired: removes expired entries
 * - getCacheStats: counts entries and sizes correctly
 * - invalidateCache: removes all entries
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  hashKey,
  getCached,
  setCached,
  pruneExpired,
  getCacheStats,
  invalidateCache,
  CACHEABLE_AGENTS,
} from "@/services/prompt-cache"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-pcache-test-"))
}

const CACHEABLE = Array.from(CACHEABLE_AGENTS)[0] // e.g. "researcher"
const NON_CACHEABLE = "backend-coder"

describe("hashKey", () => {
  it("is deterministic for the same inputs", () => {
    const k1 = hashKey("researcher", "prompt", "ctx", 1, 2)
    const k2 = hashKey("researcher", "prompt", "ctx", 1, 2)
    expect(k1).toBe(k2)
  })

  it("changes when agent differs", () => {
    const k1 = hashKey("researcher", "prompt", "ctx", 1, 2)
    const k2 = hashKey("reviewer", "prompt", "ctx", 1, 2)
    expect(k1).not.toBe(k2)
  })

  it("changes when prompt differs", () => {
    const k1 = hashKey("researcher", "prompt A", "ctx", 1, 2)
    const k2 = hashKey("researcher", "prompt B", "ctx", 1, 2)
    expect(k1).not.toBe(k2)
  })

  it("changes when stateVersion differs", () => {
    const k1 = hashKey("researcher", "prompt", "ctx", 1, 2)
    const k2 = hashKey("researcher", "prompt", "ctx", 2, 2)
    expect(k1).not.toBe(k2)
  })

  it("changes when indexVersion differs", () => {
    const k1 = hashKey("researcher", "prompt", "ctx", 1, 1)
    const k2 = hashKey("researcher", "prompt", "ctx", 1, 2)
    expect(k1).not.toBe(k2)
  })
})

describe("getCached / setCached: basic round-trip", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("returns cached response after set", () => {
    setCached(dir, CACHEABLE, "my prompt", "ctx", 5, 3, "the answer", true)
    const result = getCached(dir, CACHEABLE, "my prompt", "ctx", 5, 3, true)
    expect(result).toBe("the answer")
  })

  it("returns null before any set", () => {
    const result = getCached(dir, CACHEABLE, "some prompt", "ctx", 1, 1, true)
    expect(result).toBeNull()
  })
})

describe("getCached: safety guards", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("returns null when safe_to_cache=false (even if entry exists)", () => {
    setCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, "response", true)
    const result = getCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, false)
    expect(result).toBeNull()
  })

  it("returns null for non-cacheable agent", () => {
    // Write would be a no-op, but also getCached should refuse
    setCached(dir, NON_CACHEABLE, "prompt", "ctx", 1, 1, "response", true)
    const result = getCached(dir, NON_CACHEABLE, "prompt", "ctx", 1, 1, true)
    expect(result).toBeNull()
  })

  it("returns null when stateVersion has changed since cached", () => {
    setCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, "response", true)
    // Try to retrieve with different stateVersion (same prompt, different version)
    const result = getCached(dir, CACHEABLE, "prompt", "ctx", 2, 1, true)
    expect(result).toBeNull()
  })

  it("returns null when indexVersion has changed since cached", () => {
    setCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, "response", true)
    const result = getCached(dir, CACHEABLE, "prompt", "ctx", 1, 2, true)
    expect(result).toBeNull()
  })
})

describe("setCached: write guards", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("does NOT create a cache file when safe_to_cache=false", () => {
    setCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, "response", false)
    const stats = getCacheStats(dir)
    expect(stats.total_entries).toBe(0)
  })

  it("does NOT write for non-cacheable agent", () => {
    setCached(dir, NON_CACHEABLE, "prompt", "ctx", 1, 1, "response", true)
    const stats = getCacheStats(dir)
    expect(stats.total_entries).toBe(0)
  })
})

describe("pruneExpired", () => {
  it("removes expired entries (TTL=1ms means essentially immediately expired)", async () => {
    const dir = makeTempDir()
    try {
      // Write with TTL=1ms — will be expired after a brief pause
      setCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, "response", true, 1)
      // Pause 5ms to ensure the entry ages past TTL
      await new Promise(res => setTimeout(res, 5))
      // Prune
      pruneExpired(dir)
      const statsAfter = getCacheStats(dir)
      expect(statsAfter.valid_entries).toBe(0)
      expect(statsAfter.expired_entries).toBe(0) // pruned = removed
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("keeps valid entries", () => {
    const dir = makeTempDir()
    try {
      setCached(dir, CACHEABLE, "prompt", "ctx", 1, 1, "response", true, 60_000)
      pruneExpired(dir)
      const stats = getCacheStats(dir)
      expect(stats.valid_entries).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("getCacheStats", () => {
  it("returns zeros when cache dir does not exist", () => {
    const dir = makeTempDir()
    try {
      const stats = getCacheStats(dir)
      expect(stats.total_entries).toBe(0)
      expect(stats.valid_entries).toBe(0)
      expect(stats.expired_entries).toBe(0)
      expect(stats.cache_size_bytes).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("counts entries correctly after writes", () => {
    const dir = makeTempDir()
    try {
      setCached(dir, CACHEABLE, "p1", "ctx", 1, 1, "r1", true)
      setCached(dir, CACHEABLE, "p2", "ctx", 1, 2, "r2", true)
      const stats = getCacheStats(dir)
      expect(stats.total_entries).toBe(2)
      expect(stats.valid_entries).toBe(2)
      expect(stats.cache_size_bytes).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("invalidateCache", () => {
  it("removes all cache entries", () => {
    const dir = makeTempDir()
    try {
      setCached(dir, CACHEABLE, "p1", "ctx", 1, 1, "r1", true)
      setCached(dir, CACHEABLE, "p2", "ctx", 1, 2, "r2", true)
      expect(getCacheStats(dir).total_entries).toBe(2)
      invalidateCache(dir)
      expect(getCacheStats(dir).total_entries).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("is a no-op when cache dir does not exist", () => {
    const dir = makeTempDir()
    try {
      // Don't create any cache files — invalidate should not throw
      expect(() => invalidateCache(dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
