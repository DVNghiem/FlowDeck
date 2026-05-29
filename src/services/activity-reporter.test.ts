import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  ActivityReporter,
  summarize,
  fmtDuration,
  isDebugMode,
  type ToastFn,
} from "./activity-reporter"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecorder(): { log: (msg: string) => void; messages: string[] } {
  const messages: string[] = []
  return {
    messages,
    log: (msg: string) => messages.push(msg),
  }
}

// ── Unit helpers ──────────────────────────────────────────────────────────────

describe("summarize", () => {
  it("returns empty string for empty input", () => {
    expect(summarize("")).toBe("")
  })

  it("returns the original string when within maxLen", () => {
    expect(summarize("hello world", 20)).toBe("hello world")
  })

  it("truncates and appends ellipsis when over maxLen", () => {
    const long = "a".repeat(200)
    const result = summarize(long, 50)
    expect(result).toHaveLength(50)
    expect(result.endsWith("…")).toBe(true)
  })

  it("collapses internal whitespace", () => {
    expect(summarize("hello   world", 50)).toBe("hello world")
  })
})

describe("fmtDuration", () => {
  it("shows ms for sub-second durations", () => {
    expect(fmtDuration(42)).toBe("42ms")
    expect(fmtDuration(999)).toBe("999ms")
  })

  it("shows seconds for >= 1000ms", () => {
    expect(fmtDuration(1000)).toBe("1.0s")
    expect(fmtDuration(3200)).toBe("3.2s")
  })
})

describe("isDebugMode", () => {
  const original = process.env.FLOWDECK_DEBUG

  afterEach(() => {
    if (original === undefined) {
      delete process.env.FLOWDECK_DEBUG
    } else {
      process.env.FLOWDECK_DEBUG = original
    }
  })

  it("returns false when FLOWDECK_DEBUG is unset", () => {
    delete process.env.FLOWDECK_DEBUG
    expect(isDebugMode()).toBe(false)
  })

  it("returns true when FLOWDECK_DEBUG=true", () => {
    process.env.FLOWDECK_DEBUG = "true"
    expect(isDebugMode()).toBe(true)
  })

  it("returns true when FLOWDECK_DEBUG=1", () => {
    process.env.FLOWDECK_DEBUG = "1"
    expect(isDebugMode()).toBe(true)
  })

  it("returns false for other values", () => {
    process.env.FLOWDECK_DEBUG = "yes"
    expect(isDebugMode()).toBe(false)
  })
})

// ── ActivityReporter ─────────────────────────────────────────────────────────

describe("ActivityReporter", () => {
  let rec: ReturnType<typeof makeRecorder>
  let reporter: ActivityReporter
  const originalDebug = process.env.FLOWDECK_DEBUG

  beforeEach(() => {
    delete process.env.FLOWDECK_DEBUG
    rec = makeRecorder()
    reporter = new ActivityReporter(rec.log)
  })

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.FLOWDECK_DEBUG
    } else {
      process.env.FLOWDECK_DEBUG = originalDebug
    }
  })

  // ── tool_started ─────────────────────────────────────────────────────────

  it("emits tool_started with [→ tool] prefix", () => {
    reporter.reportToolStarted("delegate", "run the tests", { agent: "coder" })
    expect(rec.messages).toHaveLength(1)
    expect(rec.messages[0]).toContain("[→ delegate]")
    expect(rec.messages[0]).toContain("agent=coder")
    expect(rec.messages[0]).toContain("run the tests")
  })

  it("tool_started omits session/run in normal mode", () => {
    reporter.reportToolStarted("bash", "ls -la", { session_id: "sess-1", run_id: "run-1" })
    expect(rec.messages[0]).not.toContain("session=")
    expect(rec.messages[0]).not.toContain("run=")
  })

  it("tool_started includes session/run in debug mode", () => {
    process.env.FLOWDECK_DEBUG = "true"
    reporter.reportToolStarted("bash", "ls -la", { session_id: "sess-1", run_id: "run-1" })
    expect(rec.messages[0]).toContain("session=sess-1")
    expect(rec.messages[0]).toContain("run=run-1")
  })

  // ── tool_completed ────────────────────────────────────────────────────────

  it("emits tool_completed with [✓ tool] prefix and duration", () => {
    reporter.reportToolCompleted("delegate", 1200, "analysis complete", { agent: "researcher" })
    expect(rec.messages[0]).toContain("[✓ delegate]")
    expect(rec.messages[0]).toContain("1.2s")
    expect(rec.messages[0]).toContain("agent=researcher")
    expect(rec.messages[0]).toContain("analysis complete")
  })

  it("tool_completed handles undefined duration gracefully", () => {
    reporter.reportToolCompleted("bash", undefined, "done")
    expect(rec.messages[0]).toContain("[✓ bash]")
    expect(rec.messages[0]).not.toContain("undefined")
    expect(rec.messages[0]).not.toContain("NaN")
  })

  it("tool_completed shows retry count in debug mode", () => {
    process.env.FLOWDECK_DEBUG = "true"
    reporter.reportToolCompleted("delegate", 500, "ok", { retry_count: 2 })
    expect(rec.messages[0]).toContain("retries=2")
  })

  it("tool_completed omits retry count in normal mode", () => {
    reporter.reportToolCompleted("delegate", 500, "ok", { retry_count: 2 })
    expect(rec.messages[0]).not.toContain("retries=")
  })

  // ── tool_failed ───────────────────────────────────────────────────────────

  it("emits tool_failed with [✗ tool] prefix and error", () => {
    reporter.reportToolFailed("delegate", 800, "session creation failed", { agent: "planner" })
    expect(rec.messages[0]).toContain("[✗ delegate]")
    expect(rec.messages[0]).toContain("800ms")
    expect(rec.messages[0]).toContain("agent=planner")
    expect(rec.messages[0]).toContain("error=session creation failed")
  })

  it("tool_failed includes retry count in debug mode", () => {
    process.env.FLOWDECK_DEBUG = "true"
    reporter.reportToolFailed("delegate", 300, "timeout", { retry_count: 3 })
    expect(rec.messages[0]).toContain("retries=3")
  })

  // ── tool_retried ─────────────────────────────────────────────────────────

  it("emits tool_retried with [↺ tool] prefix and attempt count", () => {
    reporter.reportToolRetried("delegate", 2, "upstream error", { agent: "executor" })
    expect(rec.messages[0]).toContain("[↺ delegate]")
    expect(rec.messages[0]).toContain("attempt=2")
    expect(rec.messages[0]).toContain("upstream error")
    expect(rec.messages[0]).toContain("agent=executor")
  })

  // ── tool_fallback ─────────────────────────────────────────────────────────

  it("emits tool_fallback with [⇢ fallback] prefix", () => {
    reporter.reportToolFallback("mcp-bash", "local-bash", "MCP unavailable")
    expect(rec.messages[0]).toContain("[⇢ fallback]")
    expect(rec.messages[0]).toContain("mcp-bash")
    expect(rec.messages[0]).toContain("local-bash")
    expect(rec.messages[0]).toContain("MCP unavailable")
  })

  // ── cache_hit ─────────────────────────────────────────────────────────────

  it("emits cache_hit with [≡ tool] prefix", () => {
    reporter.reportCacheHit("delegate", "researcher")
    expect(rec.messages[0]).toContain("[≡ delegate]")
    expect(rec.messages[0]).toContain("cache hit")
    expect(rec.messages[0]).toContain("agent=researcher")
  })

  it("cache_hit includes session in debug mode", () => {
    process.env.FLOWDECK_DEBUG = "true"
    reporter.reportCacheHit("delegate", "researcher", { session_id: "sess-9" })
    expect(rec.messages[0]).toContain("session=sess-9")
  })

  // ── skipped ───────────────────────────────────────────────────────────────

  it("emits skipped with [⊘ tool] prefix and reason", () => {
    reporter.reportSkipped("codegraph", "mapping is fresh", { agent: "planner" })
    expect(rec.messages[0]).toContain("[⊘ codegraph]")
    expect(rec.messages[0]).toContain("skipped")
    expect(rec.messages[0]).toContain("mapping is fresh")
    expect(rec.messages[0]).toContain("agent=planner")
  })

  // ── stage_progress ────────────────────────────────────────────────────────

  it("emits stage_progress started with [▶ stage]", () => {
    reporter.reportStageProgress("research", "started", "gathering context")
    expect(rec.messages[0]).toContain("[▶ research]")
    expect(rec.messages[0]).toContain("started")
    expect(rec.messages[0]).toContain("gathering context")
  })

  it("emits stage_progress complete with [● stage]", () => {
    reporter.reportStageProgress("plan", "complete", "3 phases created")
    expect(rec.messages[0]).toContain("[● plan]")
    expect(rec.messages[0]).toContain("complete")
  })

  it("emits stage_progress failed with [✗ stage]", () => {
    reporter.reportStageProgress("execute", "failed", "step 2 error")
    expect(rec.messages[0]).toContain("[✗ execute]")
    expect(rec.messages[0]).toContain("failed")
  })

  it("emits stage_progress waiting with [⌛ stage]", () => {
    reporter.reportStageProgress("discuss", "waiting", "awaiting user input")
    expect(rec.messages[0]).toContain("[⌛ discuss]")
  })

  it("stage_progress includes workflow_id in debug mode", () => {
    process.env.FLOWDECK_DEBUG = "true"
    reporter.reportStageProgress("execute", "running", undefined, { workflow_id: "wf-42" })
    expect(rec.messages[0]).toContain("workflow=wf-42")
  })

  // ── timing helpers ────────────────────────────────────────────────────────

  it("trackStart and elapsedMs round-trip returns a non-negative duration", async () => {
    reporter.trackStart("key-1")
    await new Promise(r => setTimeout(r, 5))
    const ms = reporter.elapsedMs("key-1")
    expect(ms).toBeGreaterThanOrEqual(0)
  })

  it("elapsedMs consumes the key (second call returns undefined)", () => {
    reporter.trackStart("key-2")
    reporter.elapsedMs("key-2")
    expect(reporter.elapsedMs("key-2")).toBeUndefined()
  })

  it("elapsedMs returns undefined for unknown key", () => {
    expect(reporter.elapsedMs("no-such-key")).toBeUndefined()
  })

  // ── error resilience ─────────────────────────────────────────────────────

  it("does not throw when logger throws", () => {
    const throwingReporter = new ActivityReporter(() => { throw new Error("logger exploded") })
    expect(() => throwingReporter.reportToolStarted("bash", "test")).not.toThrow()
  })

  // ── input truncation ─────────────────────────────────────────────────────

  it("truncates long input summaries in normal mode", () => {
    const longInput = "x".repeat(500)
    reporter.reportToolStarted("bash", longInput)
    expect(rec.messages[0].length).toBeLessThan(200)
  })

  it("allows longer summaries in debug mode", () => {
    process.env.FLOWDECK_DEBUG = "true"
    const longInput = "x".repeat(500)
    reporter.reportToolStarted("bash", longInput)
    // In debug mode, summaries can be up to SUMMARY_MAX_DEBUG (600)
    expect(rec.messages[0]).toContain("x".repeat(50))
  })
})

// ── Toast integration ─────────────────────────────────────────────────────────

describe("ActivityReporter — toast integration", () => {
  const originalDebug = process.env.FLOWDECK_DEBUG

  afterEach(() => {
    if (originalDebug === undefined) delete process.env.FLOWDECK_DEBUG
    else process.env.FLOWDECK_DEBUG = originalDebug
    vi.restoreAllMocks()
  })

  function makeToastReporter() {
    const toasts: Array<{ message: string; variant: string; duration?: number }> = []
    const toast: ToastFn = (message, variant, duration) => {
      toasts.push({ message, variant, duration })
    }
    const reporter = new ActivityReporter(() => {}, toast)
    return { reporter, toasts }
  }

  it("does not toast for non-TOAST_ON_START tools (e.g. bash)", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportToolStarted("bash", "ls")
    expect(toasts).toHaveLength(0)
  })

  it("toasts info for delegate start", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportToolStarted("delegate", "write tests")
    expect(toasts).toHaveLength(1)
    expect(toasts[0].variant).toBe("info")
    expect(toasts[0].message).toContain("delegate")
  })

  it("toasts info for run-pipeline start", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportToolStarted("run-pipeline", "execute phase")
    expect(toasts[0].variant).toBe("info")
  })

  it("toasts error on tool failure", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportToolFailed("bash", 100, "exit 1")
    expect(toasts).toHaveLength(1)
    expect(toasts[0].variant).toBe("error")
    expect(toasts[0].message).toContain("bash")
  })

  it("toasts info on stage started", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportStageProgress("research", "started", "gathering context")
    expect(toasts[0].variant).toBe("info")
    expect(toasts[0].message).toContain("research")
  })

  it("toasts success on stage complete", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportStageProgress("plan", "complete", "done")
    expect(toasts[0].variant).toBe("success")
  })

  it("toasts error on stage failed", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportStageProgress("execute", "failed", "step error")
    expect(toasts[0].variant).toBe("error")
  })

  it("toasts warning on stage waiting", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportStageProgress("discuss", "waiting", "awaiting input")
    expect(toasts[0].variant).toBe("warning")
  })

  it("reportToolRetried emits warning toast with attempt number", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportToolRetried("delegate", 2, "response indicated retry", { agent: "executor" })
    expect(toasts).toHaveLength(1)
    expect(toasts[0].variant).toBe("warning")
    expect(toasts[0].message).toContain("delegate")
    expect(toasts[0].message).toContain("2")
  })

  it("reportToolFallback emits info toast with from and to tool names", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportToolFallback("bash", "read", "bash unavailable")
    expect(toasts).toHaveLength(1)
    expect(toasts[0].variant).toBe("info")
    expect(toasts[0].message).toContain("bash")
    expect(toasts[0].message).toContain("read")
  })

  it("reportWaitingForApproval emits warning toast with long duration", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportWaitingForApproval("Write to secrets.json")
    expect(toasts[0].variant).toBe("warning")
    expect(toasts[0].message.toLowerCase()).toContain("approval")
    expect(toasts[0].duration).toBeGreaterThanOrEqual(20_000)
  })

  it("reportCommandStarted emits info toast", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportCommandStarted("/gsd-execute-phase")
    expect(toasts[0].variant).toBe("info")
    expect(toasts[0].message).toContain("gsd-execute-phase")
  })

  it("reportCommandCompleted emits success toast", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportCommandCompleted("/gsd-execute-phase", false)
    expect(toasts[0].variant).toBe("success")
  })

  it("reportCommandCompleted success toast mentions edited files when hasEdits=true", () => {
    const { reporter, toasts } = makeToastReporter()
    reporter.reportCommandCompleted("/gsd-plan-phase", true)
    expect(toasts[0].message.toLowerCase()).toMatch(/edit|file|change/)
  })

  it("does not throw when toastFn throws", () => {
    const throwingToast: ToastFn = () => { throw new Error("toast failed") }
    const reporter = new ActivityReporter(() => {}, throwingToast)
    expect(() => reporter.reportCommandStarted("/test")).not.toThrow()
  })
})

// ── Heartbeat ─────────────────────────────────────────────────────────────────

describe("ActivityReporter — heartbeat", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("emits still-running log after HEARTBEAT_INTERVAL_MS", () => {
    vi.useFakeTimers()
    const messages: string[] = []
    const toasts: Array<{ message: string; variant: string }> = []
    const reporter = new ActivityReporter(
      (msg) => messages.push(msg),
      (msg, variant) => toasts.push({ message: msg, variant }),
    )
    reporter.trackStart("sess:run:bash")

    vi.advanceTimersByTime(15_001)

    const heartbeatMsg = messages.find(m => m.includes("still running") || m.includes("heartbeat") || m.includes("running"))
    expect(heartbeatMsg).toBeTruthy()
  })

  it("cancels heartbeat when elapsedMs is called", () => {
    vi.useFakeTimers()
    const messages: string[] = []
    const reporter = new ActivityReporter((msg) => messages.push(msg))
    reporter.trackStart("sess:run:bash")

    reporter.elapsedMs("sess:run:bash")
    const before = messages.length

    vi.advanceTimersByTime(20_000)
    // No new heartbeat messages after elapsedMs consumed the key
    expect(messages.length).toBe(before)
  })
})
