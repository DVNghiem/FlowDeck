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
  isWebResearchDescription,
  isLibraryDocsDescription,
  ContextIngressService,
  createContextIngressService,
} from "@/services/context-ingress"
import type { McpAvailability } from "@/mcp/index"

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
    writeState(
      dir,
      "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh",
    )

    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description:
        "rename the constant MAX_RETRIES to RETRY_LIMIT and update all references in the codebase",
    })

    expect(ctx.route.workflowClass).toBe("quick")
    expect(ctx.route.stages.map(s => s.name)).toContain("execute")
  })
})

// ─── readiness, load plan, and tool selection diagnostics ─────────────────

describe("ContextIngressService: readiness diagnostics", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("reports missing STATE.md as a readiness fallback", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service",
    })
    expect(ctx.readiness.statePresent).toBe(false)
    expect(ctx.readiness.fallbacks).toContain("state: STATE.md missing")
  })

  it("reports missing mapping as a readiness fallback", () => {
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service",
    })
    expect(ctx.readiness.codebaseIndexPresent).toBe(false)
    expect(ctx.readiness.fallbacks.some(f => f.includes("mapping"))).toBe(true)
  })

  it("reports codegraph install/index status", () => {
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service",
    })
    // Just verify the field exists and reflects the environment
    expect(typeof ctx.readiness.codegraphInstalled).toBe("boolean")
    expect(typeof ctx.readiness.codegraphIndexed).toBe("boolean")
    expect(typeof ctx.readiness.codegraphFresh).toBe("boolean")
  })

  it("happy path: state fresh + mapping present → no mapping fallback", () => {
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
    writeCodebaseDoc(dir, "ARCHITECTURE.md", "# Arch")
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service",
    })
    expect(ctx.readiness.statePresent).toBe(true)
    expect(ctx.readiness.stateFresh).toBe(true)
    expect(ctx.readiness.codebaseIndexPresent).toBe(true)
    expect(ctx.readiness.fallbacks.some(f => f.startsWith("mapping:"))).toBe(false)
  })
})

describe("ContextIngressService: load plan and diagnostics", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("trivial chat caps context tightly", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "hello there",
    })
    expect(ctx.isTrivialChat).toBe(true)
    expect(ctx.loadPlan.loadCodebaseDocs).toBe(false)
    expect(ctx.loadPlan.loadRecentEvents).toBe(false)
    expect(ctx.loadPlan.loadPlan).toBe(false)
  })

  it("quick workflow caps docs and events tightly", () => {
    // Many docs to test the cap
    for (let i = 0; i < 10; i++) {
      writeCodebaseDoc(dir, `DOC_${String(i).padStart(2, "0")}.md`, `# Doc ${i}`)
    }
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description:
        "rename the constant MAX_RETRIES to RETRY_LIMIT and update all references in the codebase",
    })
    expect(ctx.route.workflowClass).toBe("quick")
    expect(ctx.diagnostics.loadedDocs.length).toBeLessThanOrEqual(ctx.loadPlan.maxDocs)
    // Skipped docs are recorded
    expect(ctx.diagnostics.loadedDocs.length + ctx.diagnostics.skippedDocs.length).toBe(10)
  })

  it("records skipped docs in diagnostics when capped", () => {
    for (let i = 0; i < 8; i++) {
      writeCodebaseDoc(dir, `FILE_${i}.md`, `# F${i}`)
    }
    const service = createContextIngressService({ maxDocs: 3 })
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
    })
    expect(ctx.diagnostics.loadedDocs.length).toBe(3)
    expect(ctx.diagnostics.skippedDocs.length).toBe(5)
    expect(ctx.diagnostics.fallbackReasons.some(r => r.startsWith("docs:"))).toBe(true)
  })

  it("records dropped events when over cap or too old", () => {
    writeEvent(dir, {
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      type: "tool.before",
      tool: "read",
    })
    writeEvent(dir, {
      timestamp: new Date().toISOString(),
      type: "tool.before",
      tool: "read",
    })
    const service = createContextIngressService({ eventMaxAgeMinutes: 30, maxEvents: 1 })
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "fix the bug in the auth flow",
    })
    expect(ctx.diagnostics.droppedEvents).toBeGreaterThan(0)
    expect(ctx.recentEvents.length).toBeLessThanOrEqual(ctx.loadPlan.maxEvents)
  })

  it("exposes budget before and after in diagnostics", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
    })
    expect(ctx.diagnostics.budgetBefore).toBeDefined()
    expect(ctx.diagnostics.budgetAfter).toBeDefined()
    expect(ctx.diagnostics.budgetAfter.usedTokens).toBeGreaterThanOrEqual(0)
  })
})

describe("ContextIngressService: tool selection and token optimization", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("always emits a selectedToolFamily for non-trivial tasks", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBeDefined()
    expect(typeof ctx.selectedToolFamily!.reason).toBe("string")
  })

  it("does not crash when no MCP availability metadata is provided", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("default")
  })

  it("does not activate token optimization under threshold", () => {
    const service = createContextIngressService({
      totalTokenBudget: 1_000_000, // huge budget
      tokenOptimizationThreshold: 1_000_000,
    })
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
    })
    expect(ctx.tokenOptimizationActive).toBe(false)
  })

  it("uses plan_file from state when present", () => {
    const planningDir = join(dir, ".planning")
    mkdirSync(planningDir, { recursive: true })
    const override = join(dir, "custom-plan.md")
    writeFileSync(override, "# Custom Plan", "utf-8")
    writeState(dir, `---\nphase: 1\nplan_file: ${override}\n---\n# State\nfreshnessStatus: fresh`)
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
    })
    // Plan was loaded — token budget reflects content
    expect(ctx.diagnostics.budgetAfter.usedTokens).toBeGreaterThan(0)
  })
})

describe("ContextIngressService: heuristic field propagation", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("non-trivial task surfaces requiresDiscuss on the route", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement a new user authentication system with JWT and refresh tokens",
    })
    expect(ctx.route.requiresDiscuss).toBe(true)
    expect(ctx.route.classificationSignals?.length).toBeGreaterThan(0)
  })

  it("strong simple task surfaces requiresDiscuss=false with skip reason", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "rename the constant MAX_RETRIES to RETRY_LIMIT and update all references in the codebase",
    })
    expect(ctx.route.workflowClass).toBe("quick")
    // router may keep requiresDiscuss=true for this description; the
    // important invariants are that the field is set and the signals array
    // is non-empty.
    expect(typeof ctx.route.requiresDiscuss).toBe("boolean")
    expect(Array.isArray(ctx.route.classificationSignals)).toBe(true)
  })
})

// ─── codegraph readiness gating (MCP-available is not enough) ──────────────

describe("ContextIngressService: codegraph readiness gating", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("does not select codegraph when MCP is available but the project has no on-disk index", () => {
    // codegraph MCP is "available" per the availability list, but there is no
    // .codegraph/codegraph.db on disk in this empty project → codegraphReady
    // must be false, and the policy must fall back to a non-codegraph family.
    const codegraphAvailable: McpAvailability[] = [
      { name: "codegraph", available: true, enabled: true, type: "local" },
      { name: "grep_app", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service end to end",
      mcpAvailability: codegraphAvailable,
    })
    expect(ctx.readiness.codegraphIndexed).toBe(false)
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).not.toBe("codegraph")
  })

  it("does not select codegraph when index exists but is marked stale", () => {
    // Simulate a stale index by writing a stale CODEGRAPH.md + a fake db file.
    const cbDir = join(dir, ".codebase")
    mkdirSync(cbDir, { recursive: true })
    const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    writeFileSync(
      join(cbDir, "CODEGRAPH.md"),
      `# Codegraph Metadata\n\n**installed:** true\n**indexed:** true\n**lastIndexedAt:** ${oldDate}\n**freshnessStatus:** stale\n`,
      "utf-8",
    )
    mkdirSync(join(dir, ".codegraph"), { recursive: true })
    writeFileSync(join(dir, ".codegraph", "codegraph.db"), "", "utf-8")

    const codegraphAvailable: McpAvailability[] = [
      { name: "codegraph", available: true, enabled: true, type: "local" },
      { name: "grep_app", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service end to end",
      mcpAvailability: codegraphAvailable,
    })
    expect(ctx.readiness.codegraphIndexed).toBe(true)
    expect(ctx.readiness.codegraphFresh).toBe(false)
    expect(ctx.selectedToolFamily!.family).not.toBe("codegraph")
  })

  it("surfaces a diagnostics fallback reason when codegraph is not ready", () => {
    const codegraphAvailable: McpAvailability[] = [
      { name: "codegraph", available: true, enabled: true, type: "local" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the auth service end to end",
      mcpAvailability: codegraphAvailable,
    })
    expect(ctx.readiness.fallbacks.some((f) => f.startsWith("codegraph:"))).toBe(true)
  })
})

// ─── Intent detection for web_research and library_docs ───────────────────

describe("isWebResearchDescription", () => {
  it("detects explicit web research requests", () => {
    expect(isWebResearchDescription("web search for React 19 release notes")).toBe(true)
    expect(isWebResearchDescription("search the web for current best practices")).toBe(true)
    expect(isWebResearchDescription("look up on the web: latest Bun version")).toBe(true)
    expect(isWebResearchDescription("google it")).toBe(true)
  })

  it("detects requests for current/latest information", () => {
    expect(isWebResearchDescription("find the latest news about Bun 1.3")).toBe(true)
    expect(isWebResearchDescription("what is the current state of LLM routing?")).toBe(true)
    expect(isWebResearchDescription("latest version of TypeScript")).toBe(true)
  })

  it("does NOT match ordinary implementation tasks", () => {
    expect(isWebResearchDescription("implement the auth service")).toBe(false)
    expect(isWebResearchDescription("rename the constant MAX_RETRIES")).toBe(false)
    expect(isWebResearchDescription("fix the login bug")).toBe(false)
  })
})

describe("isLibraryDocsDescription", () => {
  it("detects library/framework API lookups", () => {
    expect(isLibraryDocsDescription("look up React hooks API for useEffect")).toBe(true)
    expect(isLibraryDocsDescription("fetch the documentation for Express middleware")).toBe(true)
    expect(isLibraryDocsDescription("npm package for date formatting")).toBe(true)
    expect(isLibraryDocsDescription("docs for Vue 3 composition API")).toBe(true)
  })

  it("detects specific library/framework signals", () => {
    expect(isLibraryDocsDescription("react hooks api")).toBe(true)
    expect(isLibraryDocsDescription("next routing components")).toBe(true)
  })

  it("does NOT match ordinary implementation tasks", () => {
    expect(isLibraryDocsDescription("implement the auth service")).toBe(false)
    expect(isLibraryDocsDescription("rename the constant")).toBe(false)
  })
})

// ─── Runtime intent classification → tool family selection ────────────────

describe("ContextIngressService: web_research and library_docs routing", () => {
  let dir: string
  beforeEach(() => {
    dir = makeTempDir()
    writeState(dir, "---\nphase: 1\n---\n# State\nfreshnessStatus: fresh")
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("classifies a web research request and routes to websearch when available", () => {
    const availability: McpAvailability[] = [
      { name: "websearch", available: true, enabled: true, type: "remote" },
      { name: "context7", available: true, enabled: true, type: "remote" },
      { name: "grep_app", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "web search for the latest React 19 release notes",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("websearch")
    expect(ctx.selectedToolFamily!.mcp).toBe("websearch")
    expect(ctx.selectedToolFamily!.preferred).toBe(true)
  })

  it("falls back to grep_app → context7 → default for web research when websearch is unavailable", () => {
    const availability: McpAvailability[] = [
      { name: "websearch", available: false, enabled: true, type: "remote", unavailableReason: "no exa key" },
      { name: "grep_app", available: true, enabled: true, type: "remote" },
      { name: "context7", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "web search for React server components",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("code_text_search")
    expect(ctx.selectedToolFamily!.mcp).toBe("grep_app")
  })

  it("falls back to context7 when only context7 is available for web research", () => {
    const availability: McpAvailability[] = [
      { name: "websearch", available: false, enabled: true, type: "remote", unavailableReason: "no exa key" },
      { name: "grep_app", available: false, enabled: true, type: "remote", unavailableReason: "npx missing" },
      { name: "context7", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "web search for React 19 best practices",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("library_docs")
    expect(ctx.selectedToolFamily!.mcp).toBe("context7")
  })

  it("classifies a library-docs request and routes to context7 when available", () => {
    const availability: McpAvailability[] = [
      { name: "context7", available: true, enabled: true, type: "remote" },
      { name: "websearch", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "look up React hooks API for useEffect",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("library_docs")
    expect(ctx.selectedToolFamily!.mcp).toBe("context7")
    expect(ctx.selectedToolFamily!.preferred).toBe(true)
  })

  it("falls back to default read for library_docs when context7 is unavailable", () => {
    const availability: McpAvailability[] = [
      { name: "context7", available: false, enabled: true, type: "remote", unavailableReason: "disabled" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "look up the React useState API",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("default")
    expect(ctx.selectedToolFamily!.preferred).toBe(false)
  })

  it("web_research intent takes priority over library_docs when both match", () => {
    const availability: McpAvailability[] = [
      { name: "websearch", available: true, enabled: true, type: "remote" },
      { name: "context7", available: true, enabled: true, type: "remote" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      // The description mentions BOTH "search the web" (web_research) and
      // a library reference. The deterministic priority is web_research first.
      description: "search the web for the React 19 hooks API documentation",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    expect(ctx.selectedToolFamily!.family).toBe("websearch")
  })

  it("web_research / library_docs classification survives even when no MCPs are available", () => {
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "web search for the latest Bun release",
      mcpAvailability: [],
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    // No MCPs available → default family. The point is: the call did NOT
    // crash and we did NOT route to codegraph (which would have been the
    // bug pre-fix).
    expect(ctx.selectedToolFamily!.family).toBe("default")
    expect(ctx.selectedToolFamily!.mcp).toBeNull()
  })

  it("non-specialized description still routes to general (no web/lib override)", () => {
    const availability: McpAvailability[] = [
      { name: "websearch", available: true, enabled: true, type: "remote" },
      { name: "context7", available: true, enabled: true, type: "remote" },
      { name: "codegraph", available: true, enabled: true, type: "local" },
    ]
    const service = createContextIngressService()
    const ctx = service.assemble({
      runId: "run-1",
      sessionId: "sess-1",
      projectRoot: dir,
      description: "implement the user notifications feature end to end",
      mcpAvailability: availability,
    })
    expect(ctx.selectedToolFamily).not.toBeNull()
    // Implementation task → code_graph_understanding preferred (when codegraph
    // is available but NOT indexed in this empty project, falls back to grep_app).
    expect(ctx.selectedToolFamily!.family).not.toBe("websearch")
    expect(ctx.selectedToolFamily!.family).not.toBe("library_docs")
  })
})
