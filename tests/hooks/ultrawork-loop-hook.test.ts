/**
 * Ultrawork Loop Hook Tests
 *
 * Covers:
 * - Hook is a no-op when FLOWDECK_ULTRAWORK is not "on"
 * - Hook skips child sessions
 * - Hook skips when STATE.md is missing
 * - Hook skips when workflow is complete
 * - Hook re-prompts orchestrator when work is pending
 * - Hook deduplicates rapid idle events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { createUltraworkLoopHook } from "@/hooks/ultrawork-loop-hook"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-ultrawork-test-"))
}

function writeState(dir: string, content: string): void {
  const planningDir = join(dir, ".planning")
  mkdirSync(planningDir, { recursive: true })
  writeFileSync(join(planningDir, "STATE.md"), content, "utf-8")
}

const BASE_STATE = `---
phase: 1
status: in_progress
plan_confirmed: true
steps_complete: []
steps_pending: [1]
last_action: init
next_action: execute
blockers: []
lastUpdatedAt: "${new Date().toISOString()}"
lastUpdatedBy: planner
lastUpdatedPhase: 1
summaryVersion: 1
freshnessStatus: fresh
---

# State
`

describe("createUltraworkLoopHook", () => {
  let dir: string
  let originalEnv: string | undefined

  beforeEach(() => {
    dir = makeTempDir()
    originalEnv = process.env.FLOWDECK_ULTRAWORK
    process.env.FLOWDECK_ULTRAWORK = "on"
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) {
      delete process.env.FLOWDECK_ULTRAWORK
    } else {
      process.env.FLOWDECK_ULTRAWORK = originalEnv
    }
  })

  it("returns null when FLOWDECK_ULTRAWORK is not on", () => {
    process.env.FLOWDECK_ULTRAWORK = "off"
    const hook = createUltraworkLoopHook({ session: { prompt: vi.fn() } } as any, () => "primary", dir)
    expect(hook).toBeNull()
  })

  it("skips non-primary sessions", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const hook = createUltraworkLoopHook({ session: { prompt } } as any, () => "primary", dir)
    writeState(dir, BASE_STATE)

    await hook!("other-session")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("skips when STATE.md is missing", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const hook = createUltraworkLoopHook({ session: { prompt } } as any, () => "primary", dir)

    await hook!("primary")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("skips when workflow is complete", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const hook = createUltraworkLoopHook({ session: { prompt } } as any, () => "primary", dir)
    writeState(dir, BASE_STATE.replace("status: in_progress", "status: done"))

    await hook!("primary")
    expect(prompt).not.toHaveBeenCalled()
  })

  it("re-prompts orchestrator when work is pending", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const hook = createUltraworkLoopHook({ session: { prompt } } as any, () => "primary", dir)
    writeState(dir, BASE_STATE)

    await hook!("primary")
    expect(prompt).toHaveBeenCalledTimes(1)
    const call = prompt.mock.calls[0][0]
    expect(call.path.id).toBe("primary")
    expect(call.body.agent).toBe("orchestrator")
    expect(call.body.parts[0].text).toContain("not yet complete")
  })

  it("deduplicates repeated idle events", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const hook = createUltraworkLoopHook({ session: { prompt } } as any, () => "primary", dir)
    writeState(dir, BASE_STATE)

    await hook!("primary")
    await hook!("primary")
    await hook!("primary")
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})
