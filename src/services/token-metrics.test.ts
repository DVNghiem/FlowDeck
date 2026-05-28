/**
 * Token Metrics Tests
 *
 * Covers:
 * - estimateTokens: rounds up correctly
 * - recordModelCall: writes event to JSONL
 * - recordCacheHit: writes event with zero output tokens
 * - recordDuplicateSuppressed: writes event with all zeros
 * - getMetricsReport: aggregates events correctly
 * - listTrackedWorkflows: returns unique workflow IDs
 * - cache_hit_rate and duplicate_suppression_rate computed correctly
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  estimateTokens,
  recordModelCall,
  recordCacheHit,
  recordDuplicateSuppressed,
  getMetricsReport,
  listTrackedWorkflows,
} from "./token-metrics"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-metrics-test-"))
}

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })

  it("rounds up for small text", () => {
    // 5 chars → ceil(5/4) = 2
    expect(estimateTokens("hello")).toBe(2)
  })

  it("estimates ~4 chars per token", () => {
    const text = "a".repeat(400)
    expect(estimateTokens(text)).toBe(100)
  })
})

describe("recordModelCall", () => {
  it("writes a model_call event", () => {
    const dir = makeTempDir()
    try {
      recordModelCall(dir, "wf-1", "plan", "input text", "output text", "planner", 150)
      const report = getMetricsReport(dir, "wf-1")
      expect(report.totals.model_calls).toBe(1)
      expect(report.by_stage[0].stage).toBe("plan")
      expect(report.by_stage[0].total_est_input_tokens).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("recordCacheHit", () => {
  it("writes a cache_hit event with zero output tokens", () => {
    const dir = makeTempDir()
    try {
      recordCacheHit(dir, "wf-2", "execute", "some prompt text", "code-explorer")
      const report = getMetricsReport(dir, "wf-2")
      expect(report.totals.cache_hits).toBe(1)
      expect(report.totals.model_calls).toBe(0)
      // Cache hit should have 0 output tokens
      expect(report.by_stage[0].total_est_output_tokens).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("recordDuplicateSuppressed", () => {
  it("writes a duplicate_suppressed event", () => {
    const dir = makeTempDir()
    try {
      recordDuplicateSuppressed(dir, "wf-3", "discuss", "researcher")
      const report = getMetricsReport(dir, "wf-3")
      expect(report.totals.duplicates_suppressed).toBe(1)
      expect(report.totals.model_calls).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("getMetricsReport aggregation", () => {
  let dir: string
  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("separates events by workflow_id", () => {
    recordModelCall(dir, "wf-A", "plan", "prompt", "output")
    recordModelCall(dir, "wf-B", "execute", "prompt2", "output2")
    const reportA = getMetricsReport(dir, "wf-A")
    const reportB = getMetricsReport(dir, "wf-B")
    expect(reportA.totals.model_calls).toBe(1)
    expect(reportB.totals.model_calls).toBe(1)
    expect(reportA.by_stage[0].stage).toBe("plan")
    expect(reportB.by_stage[0].stage).toBe("execute")
  })

  it("computes cache_hit_rate correctly", () => {
    // 2 model calls + 1 cache hit + 1 duplicate suppressed = 4 total, 1 cache = 0.25
    recordModelCall(dir, "wf-calc", "plan", "p", "o")
    recordModelCall(dir, "wf-calc", "execute", "p2", "o2")
    recordCacheHit(dir, "wf-calc", "plan", "p")
    recordDuplicateSuppressed(dir, "wf-calc", "execute")
    const report = getMetricsReport(dir, "wf-calc")
    expect(report.totals.model_calls).toBe(2)
    expect(report.totals.cache_hits).toBe(1)
    expect(report.totals.duplicates_suppressed).toBe(1)
    expect(report.totals.cache_hit_rate).toBe(0.25)
    expect(report.totals.duplicate_suppression_rate).toBe(0.25)
  })

  it("returns efficiency.most_expensive_stage as the stage with most tokens", () => {
    // plan stage gets a big input, execute gets a tiny one
    recordModelCall(dir, "wf-eff", "plan", "a".repeat(4000), "b".repeat(800))
    recordModelCall(dir, "wf-eff", "execute", "c", "d")
    const report = getMetricsReport(dir, "wf-eff")
    expect(report.efficiency.most_expensive_stage).toBe("plan")
  })

  it("reports cache_effectiveness as low when no cache hits", () => {
    recordModelCall(dir, "wf-no-cache", "discuss", "hello", "world")
    const report = getMetricsReport(dir, "wf-no-cache")
    expect(report.efficiency.cache_effectiveness).toBe("low")
  })

  it("reports cache_effectiveness as good when > 50% cache hits", () => {
    recordCacheHit(dir, "wf-good-cache", "plan", "prompt text")
    recordCacheHit(dir, "wf-good-cache", "plan", "prompt text two")
    recordCacheHit(dir, "wf-good-cache", "plan", "prompt text three")
    recordModelCall(dir, "wf-good-cache", "plan", "p", "o")
    const report = getMetricsReport(dir, "wf-good-cache")
    expect(report.efficiency.cache_effectiveness).toBe("good")
  })
})

describe("listTrackedWorkflows", () => {
  it("returns empty array when no metrics exist", () => {
    const dir = makeTempDir()
    try {
      expect(listTrackedWorkflows(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns unique workflow IDs", () => {
    const dir = makeTempDir()
    try {
      recordModelCall(dir, "wf-x", "plan", "p", "o")
      recordModelCall(dir, "wf-x", "execute", "p2", "o2")
      recordModelCall(dir, "wf-y", "discuss", "p3", "o3")
      const ids = listTrackedWorkflows(dir)
      expect(ids.sort()).toEqual(["wf-x", "wf-y"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
