import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { telemetryAfterHook, telemetryHook } from "./telemetry-hook"
import { readEvents } from "../services/telemetry"

const TMP = join(process.cwd(), ".test-tmp-telemetry-hook")

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
    expect(events[0].event).toBe("tool.complete")
    expect(events[0].status).toBe("error")
  })
})
