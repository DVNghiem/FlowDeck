import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { telemetryAfterHook, telemetryHook } from "./telemetry-hook"
import { readEvents } from "../services/telemetry"
import { ActivityReporter } from "../services/activity-reporter"

const TMP = join(process.cwd(), ".test-tmp-telemetry-hook")

function makeReporter(): { reporter: ActivityReporter; messages: string[] } {
  const messages: string[] = []
  const reporter = new ActivityReporter((msg) => messages.push(msg))
  return { reporter, messages }
}

describe("telemetry-hook", () => {
  const previousTelemetryEnabled = process.env.TELEMETRY_ENABLED

  beforeEach(() => {
    process.env.TELEMETRY_ENABLED = "true"
    if (existsSync(TMP)) rmSync(TMP, { recursive: true })
    mkdirSync(join(TMP, ".codebase"), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true })
    process.env.TELEMETRY_ENABLED = previousTelemetryEnabled
  })

  // ── Existing behaviour (unchanged) ────────────────────────────────────────

  it("uses tool session and message IDs", async () => {
    await telemetryHook(
      { directory: TMP },
      { tool: "delegate", sessionID: "sess-1", messageID: "msg-1" },
      { args: { agent: "backend-coder" } },
    )

    const events = readEvents(TMP)
    expect(events).toHaveLength(1)
    expect(events[0].session_id).toBe("sess-1")
    expect(events[0].run_id).toBe("msg-1")
    expect(events[0].event).toBe("tool.call")
  })

  it("marks tool.complete as error when output reports failure", async () => {
    await telemetryAfterHook(
      { directory: TMP },
      { tool: "delegate", sessionID: "sess-2", messageID: "msg-2" },
      { output: JSON.stringify({ success: false, error: "failed" }) },
    )

    const events = readEvents(TMP)
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe("tool.failed")
    expect(events[0].status).toBe("error")
  })

  // ── Duration tracking ──────────────────────────────────────────────────────

  it("records duration_ms in telemetry after hook when before hook ran first", async () => {
    const toolInput = { tool: "bash", sessionID: "sess-3", messageID: "msg-3" }
    await telemetryHook({ directory: TMP }, toolInput, { args: {} })
    await new Promise(r => setTimeout(r, 5))
    await telemetryAfterHook({ directory: TMP }, toolInput, { output: "ok" })

    const events = readEvents(TMP)
    const completeEvent = events.find(e => e.event === "tool.complete" || e.event === "tool.failed")
    expect(completeEvent?.duration_ms).toBeGreaterThanOrEqual(0)
    expect(typeof completeEvent?.duration_ms).toBe("number")
  })

  it("handles missing before-hook gracefully (duration_ms is undefined)", async () => {
    await telemetryAfterHook(
      { directory: TMP },
      { tool: "bash", sessionID: "sess-4", messageID: "msg-4" },
      { output: "done" },
    )
    const events = readEvents(TMP)
    const ev = events[0]
    // duration_ms may be undefined since no before hook ran; it must not throw
    expect(ev.event).toBe("tool.complete")
  })

  // ── User-visible activity (reporter integration) ───────────────────────────

  it("emits tool_started to reporter for reportable tools", async () => {
    const { reporter, messages } = makeReporter()
    await telemetryHook(
      { directory: TMP },
      { tool: "bash", sessionID: "sess-5", messageID: "msg-5" },
      { args: { command: "ls -la" } },
      reporter,
    )
    expect(messages.some(m => m.includes("[→ bash]"))).toBe(true)
  })

  it("does NOT emit tool_started for non-reportable tools", async () => {
    const { reporter, messages } = makeReporter()
    await telemetryHook(
      { directory: TMP },
      { tool: "unknown-internal-tool", sessionID: "sess-6", messageID: "msg-6" },
      { args: {} },
      reporter,
    )
    expect(messages.length).toBe(0)
  })

  it("emits tool_completed to reporter on success", async () => {
    const { reporter, messages } = makeReporter()
    const toolInput = { tool: "bash", sessionID: "sess-7", messageID: "msg-7" }
    await telemetryHook({ directory: TMP }, toolInput, { args: {} }, reporter)
    messages.length = 0 // clear started message

    await telemetryAfterHook({ directory: TMP }, toolInput, { output: "success output" }, reporter)
    expect(messages.some(m => m.includes("[✓ bash]"))).toBe(true)
  })

  it("emits tool_failed to reporter on error output", async () => {
    const { reporter, messages } = makeReporter()
    const toolInput = { tool: "bash", sessionID: "sess-8", messageID: "msg-8" }
    await telemetryHook({ directory: TMP }, toolInput, { args: {} }, reporter)
    messages.length = 0

    await telemetryAfterHook(
      { directory: TMP },
      toolInput,
      { error: "process exited with code 1" },
      reporter,
    )
    expect(messages.some(m => m.includes("[✗ bash]"))).toBe(true)
  })

  it("does NOT double-report delegate (self-logging tool) in after hook", async () => {
    const { reporter, messages } = makeReporter()
    const toolInput = { tool: "delegate", sessionID: "sess-9", messageID: "msg-9" }
    await telemetryHook({ directory: TMP }, toolInput, { args: {} }, reporter)
    messages.length = 0

    await telemetryAfterHook({ directory: TMP }, toolInput, { output: "done" }, reporter)
    // delegate is self-logging — telemetry-hook after should NOT emit for it
    expect(messages.length).toBe(0)
  })

  // ── Structured telemetry fields ────────────────────────────────────────────

  it("includes result_summary in tool.complete event", async () => {
    const toolInput = { tool: "bash", sessionID: "sess-10", messageID: "msg-10" }
    await telemetryHook({ directory: TMP }, toolInput, { args: {} })
    await telemetryAfterHook({ directory: TMP }, toolInput, { output: "file list output" })

    const events = readEvents(TMP)
    const complete = events.find(e => e.event === "tool.complete")
    expect(complete?.result_summary).toBeTruthy()
  })

  it("records tool.failed event type (not tool.complete) on error", async () => {
    await telemetryAfterHook(
      { directory: TMP },
      { tool: "write", sessionID: "sess-11", messageID: "msg-11" },
      { output: JSON.stringify({ success: false, error: "permission denied" }) },
    )
    const events = readEvents(TMP)
    expect(events[0].event).toBe("tool.failed")
  })

  // ── Self-logging exclusion in before-hook ──────────────────────────────────

  it("does NOT emit tool_started for delegate in before-hook (self-logging exclusion)", async () => {
    const { reporter, messages } = makeReporter()
    await telemetryHook(
      { directory: TMP },
      { tool: "delegate", sessionID: "sess-12", messageID: "msg-12" },
      { args: { agent: "executor" } },
      reporter,
    )
    // delegate manages its own lifecycle — before-hook must not emit [→ delegate]
    const startedMsg = messages.find(m => m.includes("[→ delegate]"))
    expect(startedMsg).toBeUndefined()
  })

  it("does NOT emit tool_started for run-pipeline in before-hook (self-logging exclusion)", async () => {
    const { reporter, messages } = makeReporter()
    await telemetryHook(
      { directory: TMP },
      { tool: "run-pipeline", sessionID: "sess-13", messageID: "msg-13" },
      { args: { agents: ["a", "b"] } },
      reporter,
    )
    const startedMsg = messages.find(m => m.includes("[→ run-pipeline]"))
    expect(startedMsg).toBeUndefined()
  })

  it("calls reporter.trackStart for all reportable tools (heartbeat registration)", async () => {
    const messages: string[] = []
    const trackStartCalls: string[] = []
    const reporter = new ActivityReporter((msg) => messages.push(msg))
    const originalTrackStart = reporter.trackStart.bind(reporter)
    reporter.trackStart = (key: string) => { trackStartCalls.push(key); originalTrackStart(key) }

    await telemetryHook(
      { directory: TMP },
      { tool: "bash", sessionID: "sess-14", messageID: "msg-14" },
      { args: {} },
      reporter,
    )

    expect(trackStartCalls.some(k => k.includes("bash"))).toBe(true)
  })
})

