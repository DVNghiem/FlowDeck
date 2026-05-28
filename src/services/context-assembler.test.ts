/**
 * Context Assembler Tests
 *
 * Covers:
 * - assembleStageContext: returns compact_summary with key fields
 * - state-first reuse: second call with same versions returns from_cache=true
 * - version change invalidates cache
 * - stage-specific fields are included
 * - works when STATE.md is missing
 * - invalidateContextCache clears per-dir cache
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  assembleStageContext,
  invalidateContextCache,
  getContextCacheSize,
} from "./context-assembler"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-ctx-test-"))
}

function writeState(dir: string, fields: Record<string, unknown>): void {
  const planDir = join(dir, ".planning")
  mkdirSync(planDir, { recursive: true })
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`)
  writeFileSync(join(planDir, "STATE.md"), lines.join("\n") + "\n", "utf-8")
}

function writeIndex(dir: string, fields: Record<string, unknown>): void {
  const planDir = join(dir, ".planning")
  mkdirSync(planDir, { recursive: true })
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`)
  writeFileSync(join(planDir, "CODEBASE_INDEX.md"), lines.join("\n") + "\n", "utf-8")
}

describe("assembleStageContext: basic fields", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateContextCache(dir) })

  it("returns a compact_summary string", () => {
    writeState(dir, { phase: 2, status: "planning", summaryVersion: 1, freshnessStatus: "fresh" })
    const ctx = assembleStageContext(dir, "plan")
    expect(typeof ctx.compact_summary).toBe("string")
    expect(ctx.compact_summary.length).toBeGreaterThan(0)
  })

  it("includes stage in compact_summary", () => {
    writeState(dir, { summaryVersion: 1 })
    const ctx = assembleStageContext(dir, "execute")
    expect(ctx.compact_summary).toContain("stage=execute")
  })

  it("includes status when present in state", () => {
    writeState(dir, { phase: 1, status: "planning", summaryVersion: 1 })
    const ctx = assembleStageContext(dir, "plan")
    expect(ctx.compact_summary).toContain("status=planning")
  })

  it("reports state_version from summaryVersion field", () => {
    writeState(dir, { summaryVersion: 7, status: "active" })
    const ctx = assembleStageContext(dir, "plan")
    expect(ctx.state_version).toBe(7)
  })
})

describe("assembleStageContext: state-first reuse (caching)", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir(); invalidateContextCache(dir) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateContextCache(dir) })

  it("second call with same versions returns from_cache=true", () => {
    writeState(dir, { summaryVersion: 3, status: "active" })
    const ctx1 = assembleStageContext(dir, "plan")
    expect(ctx1.from_cache).toBe(false)
    const ctx2 = assembleStageContext(dir, "plan")
    expect(ctx2.from_cache).toBe(true)
  })

  it("returns same compact_summary on cache hit", () => {
    writeState(dir, { summaryVersion: 5, status: "executing" })
    const ctx1 = assembleStageContext(dir, "execute")
    const ctx2 = assembleStageContext(dir, "execute")
    expect(ctx2.compact_summary).toBe(ctx1.compact_summary)
  })

  it("different stages get separate cache entries", () => {
    writeState(dir, { summaryVersion: 1, status: "active" })
    const ctxPlan = assembleStageContext(dir, "plan")
    const ctxExecute = assembleStageContext(dir, "execute")
    // Both should be first calls (not cached from each other)
    expect(ctxPlan.from_cache).toBe(false)
    expect(ctxExecute.from_cache).toBe(false)
  })
})

describe("assembleStageContext: version change invalidates cache", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir(); invalidateContextCache(dir) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateContextCache(dir) })

  it("updates state_version and clears cache when summaryVersion changes", () => {
    writeState(dir, { summaryVersion: 1, status: "planning" })
    const ctx1 = assembleStageContext(dir, "plan")
    expect(ctx1.state_version).toBe(1)
    expect(ctx1.from_cache).toBe(false)

    // Simulate a state write: update summaryVersion on disk + invalidate cache
    writeState(dir, { summaryVersion: 2, status: "executing" })
    invalidateContextCache(dir)

    const ctx2 = assembleStageContext(dir, "plan")
    expect(ctx2.state_version).toBe(2)
    expect(ctx2.from_cache).toBe(false)
    expect(ctx2.compact_summary).toContain("status=executing")
  })
})

describe("assembleStageContext: missing STATE.md", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir(); invalidateContextCache(dir) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateContextCache(dir) })

  it("returns a valid context with state_version=0 when state file is missing", () => {
    const ctx = assembleStageContext(dir, "discuss")
    expect(ctx.state_version).toBe(0)
    expect(ctx.compact_summary).toContain("stage=discuss")
    expect(typeof ctx.compact_summary).toBe("string")
  })
})

describe("invalidateContextCache", () => {
  it("clears cache entries for the given directory", () => {
    const dir = makeTempDir()
    try {
      writeState(dir, { summaryVersion: 1, status: "active" })
      assembleStageContext(dir, "plan")
      assembleStageContext(dir, "execute")
      const cacheSize = getContextCacheSize()
      expect(cacheSize).toBeGreaterThan(0)

      invalidateContextCache(dir)
      // After invalidation, next call is a cache miss
      const ctx = assembleStageContext(dir, "plan")
      expect(ctx.from_cache).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      invalidateContextCache(dir)
    }
  })
})
