/**
 * Context Ingress Service Tests
 *
 * Covers:
 * - isTrivialChat identifies greetings, short questions, and trivial patterns
 * - isTrivialChat returns false for implementation tasks with verbs/file paths
 * - assemble returns isTrivialChat=true and skips heavy context for trivial chats
 * - assemble loads planning state, plan content, codebase docs, and events
 * - assemble selects relevant rules and skills
 * - assemble computes a token budget snapshot
 * - assemble dedupes and prunes context (truncates long PLAN.md, drops old events)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  isTrivialChat,
  ContextIngressService,
  createContextIngressService,
} from "@/services/context-ingress"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-context-ingress-test-"))
}

function writeState(dir: string, content: string): void {
  const planningDir = join(dir, ".planning")
  mkdirSync(planningDir, { recursive: true })
  writeFileSync(join(planningDir, "STATE.md"), content, "utf-8")
}

function writePlan(dir: string, content: string): void {
  const planningDir = join(dir, ".planning")
  mkdirSync(planningDir, { recursive: true })
  writeFileSync(join(planningDir, "PLAN.md"), content, "utf-8")
}

function writeCodebaseDoc(dir: string, name: string, content: string): void {
  const cbDir = join(dir, ".codebase")
  mkdirSync(cbDir, { recursive: true })
  writeFileSync(join(cbDir, name), content, "utf-8")
}

function writeEvent(dir: string, event: Record<string, unknown>): void {
  const opDir = join(dir, ".opencode")
  mkdirSync(opDir, { recursive: true })
  const path = join(opDir, "flowdeck-events.jsonl")
  writeFileSync(path, `${JSON.stringify(event)}\n`, { flag: "a", encoding: "utf-8" })
}

describe("isTrivialChat", () => {
  it("detects greetings as trivial", () => {
    const result = isTrivialChat("hello there")
    expect(result.isTrivialChat).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.9)
  })

  it("detects short questions as trivial", () => {
    const result = isTrivialChat("what is the meaning of this")
    expect(result.isTrivialChat).toBe(true)
  })

  it("detects 'how do I' questions as trivial", () => {
    const result = isTrivialChat("how do I use this plugin")
    expect(result.isTrivialChat).toBe(true)
  })

  it("detects summarize requests as trivial", () => {
    const result = isTrivialChat("summarize the plan")
    expect(result.isTrivialChat).toBe(true)
  })

  it("returns false for implementation tasks", () => {
    const result = isTrivialChat("add a new endpoint to src/services/auth.ts")
    expect(result.isTrivialChat).toBe(false)
  })

  it("returns false for refactor tasks", () => {
    const result = isTrivialChat("refactor the user service into smaller modules")
    expect(result.isTrivialChat).toBe(false)
  })

  it("returns false for multi-step language", () => {
    const result = isTrivialChat("first write tests, then implement the function")
    expect(result.isTrivialChat).toBe(false)
  })

  it("handles empty input", () => {
    const result = isTrivialChat("")
    expect(result.isTrivialChat).toBe(true)
    expect(result.confidence).toBe(1)
  })
})

describe("ContextIngressService", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("factory creates a service instance", () => {
    const service = createContextIngressService()
    expect(service).toBeInstanceOf(ContextIngressService)
  })

  it("short-circuits trivial chat and skips heavy context", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")
    writePlan(dir, "# Plan\n\nStep 1: do something")
    writeCodebaseDoc(dir, "ARCHITECTURE.md", "# Architecture")
    writeEvent(dir, {
      timestamp: new Date().toISOString(),
      type: "tool.before",
      tool: "read",
    })

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "hello there",
    })

    expect(ctx.isTrivialChat).toBe(true)
    expect(ctx.relevantRules).toHaveLength(0)
    expect(ctx.relevantSkills).toHaveLength(0)
    expect(ctx.recentEvents).toHaveLength(0)
    expect(ctx.tokenBudget.usedTokens).toBeLessThan(5000)
  })

  it("loads planning state and plan content for heavy tasks", () => {
    writeState(dir, "---\nphase: 1\nstatus: in_progress\n---\n# State")
    writePlan(dir, "# Plan\n\nStep 1: implement feature")

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the authentication service",
    })

    expect(ctx.isTrivialChat).toBe(false)
    expect(ctx.state.phase).toBe("1")
    expect(ctx.tokenBudget.usedTokens).toBeGreaterThan(0)
  })

  it("loads codebase docs and recent events for heavy tasks", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")
    writeCodebaseDoc(dir, "ARCHITECTURE.md", "# Architecture\n\nSystem design")
    writeEvent(dir, {
      timestamp: new Date().toISOString(),
      type: "tool.before",
      tool: "read",
      args: { filePath: "src/index.ts" },
    })

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "fix the login bug in src/auth.ts",
    })

    expect(ctx.recentEvents).toHaveLength(1)
    expect(ctx.recentEvents[0]?.tool).toBe("read")
    expect(ctx.tokenBudget.usedTokens).toBeGreaterThan(0)
  })

  it("selects relevant skills for the task", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "build a landing page for the marketing site",
    })

    expect(ctx.relevantSkills).toContain("landing-page-design")
  })

  it("dedupes rule paths", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")
    writePlan(dir, "# Plan")

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "write tests for the user service",
    })

    const unique = new Set(ctx.relevantRules)
    expect(unique.size).toBe(ctx.relevantRules.length)
  })

  it("truncates PLAN.md when it exceeds the budget threshold", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")
    const longPlan = "# Plan\n\n" + "x".repeat(10_000)
    writePlan(dir, longPlan)

    const untruncated = createContextIngressService({
      planTruncateThreshold: 100_000,
      planTruncateTo: 100_000,
    }).assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the full feature",
    })

    const truncated = createContextIngressService({
      planTruncateThreshold: 8000,
      planTruncateTo: 4000,
    }).assemble({
      runId: "run-2",
      sessionId: "sess-2",
      projectRoot: dir,
      description: "implement the full feature",
    })

    expect(truncated.tokenBudget.usedTokens).toBeLessThan(untruncated.tokenBudget.usedTokens)
  })

  it("drops events older than the max age", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")
    const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    writeEvent(dir, { timestamp: oldDate, type: "tool.before", tool: "read" })

    const service = createContextIngressService({ eventMaxAgeMinutes: 30 })
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "fix the bug",
    })

    expect(ctx.recentEvents).toHaveLength(0)
  })

  it("computes token budget with measurable values", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")
    writePlan(dir, "# Plan\n\nStep 1")

    const service = createContextIngressService({ totalTokenBudget: 50_000 })
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement feature",
    })

    expect(ctx.tokenBudget.totalTokens).toBe(50_000)
    expect(ctx.tokenBudget.usedTokens).toBeGreaterThan(0)
    expect(ctx.tokenBudget.remainingTokens).toBe(50_000 - ctx.tokenBudget.usedTokens)
    expect(ctx.tokenBudget.percentUsed).toBeGreaterThanOrEqual(0)
    expect(ctx.tokenBudget.percentUsed).toBeLessThanOrEqual(100)
  })

  it("produces a workflow route based on task complexity", () => {
    writeState(dir, "---\nphase: 1\n---\n# State")

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "summarize the code changes",
    })

    expect(ctx.route.workflowClass).toBe("quick")
    expect(ctx.route.stages).toContain("execute")
  })
})
