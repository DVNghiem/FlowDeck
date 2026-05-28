/**
 * Extended Token Metrics Tests (Round 2)
 *
 * Covers:
 * - recordRuleBypass: writes rule_bypass event
 * - rule_bypasses counted in StageSummary and totals
 * - rule_bypass_rate computed correctly
 * - startWorkflowTimer / getWorkflowElapsed: timing works
 * - elapsed_ms included in MetricsReport
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  recordModelCall,
  recordRuleBypass,
  startWorkflowTimer,
  getWorkflowElapsed,
  getMetricsReport,
} from "./token-metrics"

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "metrics-ext-test-"))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe("recordRuleBypass", () => {
  it("records a rule_bypass event", () => {
    recordRuleBypass(tempDir, "wf1", "verify", "file_exists")
    const report = getMetricsReport(tempDir, "wf1")
    const verifyStage = report.by_stage.find(s => s.stage === "verify")
    expect(verifyStage?.rule_bypasses).toBe(1)
  })

  it("rule_bypasses counted in totals", () => {
    recordRuleBypass(tempDir, "wf1", "delegate", "json_valid")
    recordRuleBypass(tempDir, "wf1", "delegate", "detect_language")
    const report = getMetricsReport(tempDir, "wf1")
    expect(report.totals.rule_bypasses).toBe(2)
  })

  it("rule_bypass_rate computed correctly", () => {
    recordModelCall(tempDir, "wf1", "plan", "input text", "output", "planner")
    recordRuleBypass(tempDir, "wf1", "verify", "file_exists")
    recordRuleBypass(tempDir, "wf1", "verify", "json_valid")
    const report = getMetricsReport(tempDir, "wf1")
    // 1 model call + 2 rule bypasses = 3 total
    expect(report.totals.rule_bypass_rate).toBeCloseTo(2 / 3, 2)
  })

  it("rule_bypasses default to 0 when not recorded", () => {
    recordModelCall(tempDir, "wf1", "plan", "input", "output", "planner")
    const report = getMetricsReport(tempDir, "wf1")
    const planStage = report.by_stage.find(s => s.stage === "plan")
    expect(planStage?.rule_bypasses).toBe(0)
    expect(report.totals.rule_bypasses).toBe(0)
    expect(report.totals.rule_bypass_rate).toBe(0)
  })
})

describe("workflow timer", () => {
  it("getWorkflowElapsed returns undefined before startWorkflowTimer", () => {
    expect(getWorkflowElapsed("no-such-workflow")).toBeUndefined()
  })

  it("getWorkflowElapsed returns a number after startWorkflowTimer", async () => {
    startWorkflowTimer("wf-timer-test")
    await new Promise(r => setTimeout(r, 10))
    const elapsed = getWorkflowElapsed("wf-timer-test")
    expect(typeof elapsed).toBe("number")
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })

  it("elapsed_ms included in MetricsReport when timer is running", () => {
    startWorkflowTimer("wf-timed")
    recordModelCall(tempDir, "wf-timed", "plan", "input", "output", "planner")
    const report = getMetricsReport(tempDir, "wf-timed")
    expect(report.elapsed_ms).toBeDefined()
    expect(typeof report.elapsed_ms).toBe("number")
  })

  it("elapsed_ms is undefined in MetricsReport when timer not started", () => {
    recordModelCall(tempDir, "wf-notimed", "plan", "input", "output", "planner")
    const report = getMetricsReport(tempDir, "wf-notimed")
    expect(report.elapsed_ms).toBeUndefined()
  })
})
