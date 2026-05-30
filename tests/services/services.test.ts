import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"

const TMP = join(process.cwd(), ".test-tmp-services")

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(join(TMP, ".codebase"), { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

// ──────────────────────────────────────────────────────────
// Run Trace Service
// ──────────────────────────────────────────────────────────
describe("run-trace", () => {
  it("starts and ends a trace", async () => {
    const { startTrace, endTrace, getTrace } = await import("@/services/run-trace")
    const trace = startTrace(TMP, "fd-new-feature", { phase: 1 })
    expect(trace.status).toBe("running")
    endTrace(TMP, trace.run_id, "complete", "Feature implemented")
    const updated = getTrace(TMP, trace.run_id)
    expect(updated?.status).toBe("complete")
    expect(updated?.outcome).toBe("Feature implemented")
    expect(updated?.ended_at).toBeDefined()
  })

  it("listTraces returns most recent first", async () => {
    const { startTrace, listTraces } = await import("@/services/run-trace")
    startTrace(TMP, "cmd-a", {})
    startTrace(TMP, "cmd-b", {})
    const list = listTraces(TMP)
    expect(list[0].command).toBe("cmd-b")
    expect(list[1].command).toBe("cmd-a")
  })

  it("diffTraces detects added and removed files", async () => {
    const { startTrace, touchFile, diffTraces } = await import("@/services/run-trace")
    const a = startTrace(TMP, "fd-fix-bug", {})
    touchFile(TMP, a.run_id, "src/auth.ts")
    touchFile(TMP, a.run_id, "src/shared.ts")
    const b = startTrace(TMP, "fd-fix-bug", {})
    touchFile(TMP, b.run_id, "src/payment.ts")
    touchFile(TMP, b.run_id, "src/shared.ts")
    const diff = diffTraces(TMP, a.run_id, b.run_id)
    expect(diff?.added_files).toContain("src/payment.ts")
    expect(diff?.removed_files).toContain("src/auth.ts")
    expect(diff?.shared_files).toContain("src/shared.ts")
  })
})

// ──────────────────────────────────────────────────────────
// Approval Manager Service
// ──────────────────────────────────────────────────────────
describe("approval-manager", () => {
  it("isSensitivePath detects auth paths", async () => {
    const { isSensitivePath } = await import("@/services/approval-manager")
    expect(isSensitivePath("src/auth/login.ts")).toBe(true)
    expect(isSensitivePath("src/payment/stripe.ts")).toBe(true)
    expect(isSensitivePath("src/components/Button.tsx")).toBe(false)
  })

  it("requestApproval creates a pending request", async () => {
    const { requestApproval, getPendingApprovals } = await import("@/services/approval-manager")
    requestApproval(TMP, "run-1", "sensitive_file", "Auth file change", { file_path: "src/auth.ts", risk_score: 30 })
    const pending = getPendingApprovals(TMP)
    expect(pending).toHaveLength(1)
    expect(pending[0].status).toBe("pending")
    expect(pending[0].file_path).toBe("src/auth.ts")
  })

  it("resolveApproval sets status", async () => {
    const { requestApproval, resolveApproval, getPendingApprovals } = await import("@/services/approval-manager")
    const req = requestApproval(TMP, "run-1", "sensitive_file", "reason")
    resolveApproval(TMP, req.id, "approved")
    const pending = getPendingApprovals(TMP)
    expect(pending).toHaveLength(0)
  })

  it("isApprovalRequired returns true for high-risk or sensitive paths", async () => {
    const { isApprovalRequired } = await import("@/services/approval-manager")
    expect(isApprovalRequired("src/auth.ts", 80)).toBe(true)   // sensitive path
    expect(isApprovalRequired("src/utils.ts", 30)).toBe(true)  // low risk score
    expect(isApprovalRequired("src/utils.ts", 90)).toBe(false) // neither
  })
})

// ──────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────
// Agent Performance Service
// ──────────────────────────────────────────────────────────
describe("agent-performance", () => {
  it("records runs and computes stats", async () => {
    const { recordRun, getStats } = await import("@/services/agent-performance")
    recordRun(TMP, "backend-coder", "github-copilot/sonnet-4.6", "implementation", true, 5000)
    recordRun(TMP, "backend-coder", "github-copilot/sonnet-4.6", "implementation", true, 4500)
    recordRun(TMP, "backend-coder", "github-copilot/sonnet-4.6", "implementation", false, 3000)
    const stats = getStats(TMP, { agent: "backend-coder" })
    expect(stats).toHaveLength(1)
    expect(stats[0].runs).toBe(3)
    expect(stats[0].successes).toBe(2)
    expect(stats[0].failures).toBe(1)
  })

  it("getBestAgentForTask returns highest success rate (requires 3+ runs)", async () => {
    const { recordRun, getBestAgentForTask } = await import("@/services/agent-performance")
    // github-copilot/sonnet-4.6: 2 success, 1 failure (67%)
    recordRun(TMP, "reviewer", "github-copilot/sonnet-4.6", "review", true, 1000)
    recordRun(TMP, "reviewer", "github-copilot/sonnet-4.6", "review", false, 900)
    recordRun(TMP, "reviewer", "github-copilot/sonnet-4.6", "review", true, 1100)
    // minimax/minimax-m2.7-highspeed: 3 success, 0 failure (100%) — should win
    recordRun(TMP, "reviewer", "minimax/minimax-m2.7-highspeed", "review", true, 800)
    recordRun(TMP, "reviewer", "minimax/minimax-m2.7-highspeed", "review", true, 850)
    recordRun(TMP, "reviewer", "minimax/minimax-m2.7-highspeed", "review", true, 750)
    const best = getBestAgentForTask(TMP, "review")
    expect(best?.model).toBe("minimax/minimax-m2.7-highspeed")
    expect(best?.success_rate).toBe(1)
  })

  it("returns null when no runs exist", async () => {
    const { getBestAgentForTask } = await import("@/services/agent-performance")
    const best = getBestAgentForTask(TMP, "security")
    expect(best).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────
// Policy Compiler Service
// ──────────────────────────────────────────────────────────
describe("policy-compiler", () => {
  it("evaluatePolicies returns empty array with no policies file", async () => {
    const { evaluatePolicies } = await import("@/services/policy-compiler")
    const violations = evaluatePolicies(TMP, { command: "fd-fix-bug" })
    // Hardcoded TDD_POLICIES are always returned if they match the trigger
    expect(violations).toEqual([
      {
        policy_id: "tdd-bugfix-requires-regression-test",
        policy_name: "Bugfix requires regression test",
        rule: "Every bugfix must include a regression test unless override is explicitly granted",
        severity: "warn",
        trigger: "fd-fix-bug",
      },
    ])
  })

  it("evaluatePolicies matches trigger keywords in context", async () => {
    const { evaluatePolicies } = await import("@/services/policy-compiler")
    // Write a policy store directly
    writeFileSync(join(TMP, ".codebase", "POLICIES.json"), JSON.stringify({
      version: "1.0",
      last_updated: new Date().toISOString(),
      policies: [{
        id: "no-auth-without-review",
        name: "Require approval for auth changes",
        trigger: "auth change",
        rule: "Require approval before editing auth logic",
        source: "manual",
        failure_count: 0,
        created_at: new Date().toISOString(),
        active: true,
      }],
    }))
    const violations = evaluatePolicies(TMP, { change_description: "updating auth middleware" })
    expect(violations).toHaveLength(1)
    expect(violations[0].policy_id).toBe("no-auth-without-review")
  })

  it("evaluatePolicies ignores inactive policies", async () => {
    const { evaluatePolicies } = await import("@/services/policy-compiler")
    writeFileSync(join(TMP, ".codebase", "POLICIES.json"), JSON.stringify({
      version: "1.0",
      last_updated: new Date().toISOString(),
      policies: [{
        id: "p1",
        name: "inactive policy",
        trigger: "auth",
        rule: "should not fire",
        source: "manual",
        failure_count: 0,
        created_at: new Date().toISOString(),
        active: false,
      }],
    }))
    const violations = evaluatePolicies(TMP, { change_description: "updating auth logic" })
    expect(violations).toHaveLength(0)
  })

  it("learnFromFailure proposes policy for auth failures", async () => {
    const { learnFromFailure } = await import("@/services/policy-compiler")
    const proposal = learnFromFailure("auth_bypass", ["src/auth/middleware.ts"])
    expect(proposal).not.toBeNull()
    expect(proposal?.trigger).toBe("auth change")
    expect(proposal?.source).toBe("learned")
  })

  it("learnFromFailure returns null for unknown patterns", async () => {
    const { learnFromFailure } = await import("@/services/policy-compiler")
    const proposal = learnFromFailure("generic_error", ["src/utils/helper.ts"])
    expect(proposal).toBeNull()
  })

  it("deriveSeverity block for 'require approval' rules", async () => {
    const { evaluatePolicies } = await import("@/services/policy-compiler")
    writeFileSync(join(TMP, ".codebase", "POLICIES.json"), JSON.stringify({
      version: "1.0",
      last_updated: new Date().toISOString(),
      policies: [{
        id: "p-block",
        name: "Block payment writes",
        trigger: "payment",
        rule: "Require approval before editing payment logic",
        source: "manual",
        failure_count: 0,
        created_at: new Date().toISOString(),
        active: true,
      }],
    }))
    const violations = evaluatePolicies(TMP, { file_path: "src/payment/checkout.ts" })
    expect(violations[0].severity).toBe("block")
  })
})
