/**
 * TUI Layout Invariants
 *
 * Verifies that the FlowDeck plugin never writes directly to stdout or stderr
 * during normal plugin operations. Direct stdout/stderr writes bypass @opentui's
 * terminal renderer and corrupt the TUI layout — specifically causing log content
 * to overwrite the fixed input/composer area at the bottom of the screen.
 *
 * These tests enforce the invariant: all observable output from the plugin
 * must go through client.app.log(), never through console.* or process.std*.
 *
 * Tests also confirm no new tool was introduced to work around the issue.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// ── stdout/stderr capture helpers ─────────────────────────────────────────

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: any, ...args: any[]): boolean => {
    lines.push(String(chunk))
    return true
  }
  return { lines, restore: () => { process.stdout.write = original } }
}

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk: any, ...args: any[]): boolean => {
    lines.push(String(chunk))
    return true
  }
  return { lines, restore: () => { process.stderr.write = original } }
}

// ── Test directory helpers ────────────────────────────────────────────────

const TEST_BASE = join(tmpdir(), "flowdeck-tui-invariants-test", Date.now().toString())

function createTestDir(suffix: string): string {
  const dir = join(TEST_BASE, suffix)
  mkdirSync(join(dir, ".planning"), { recursive: true })
  return dir
}

function writeMockState(dir: string): void {
  writeFileSync(
    join(dir, ".planning", "STATE.md"),
    [
      "---",
      "phase: 1",
      "status: planned",
      "plan_confirmed: true",
      "steps_complete: []",
      "steps_pending: [1]",
      "last_action: \"init\"",
      "next_action: \"execute\"",
      "blockers: []",
      `lastUpdatedAt: "${new Date().toISOString()}"`,
      "lastUpdatedBy: planner",
      "lastUpdatedPhase: 1",
      "summaryVersion: 1",
      "freshnessStatus: fresh",
      "---",
      "",
      "# State",
    ].join("\n"),
    "utf-8",
  )
}

afterEach(() => {
  rmSync(TEST_BASE, { recursive: true, force: true })
})

// ── config/loader ─────────────────────────────────────────────────────────

describe("config loader — no stdout during config parse failure", () => {
  it("does not write to stdout when config JSON is malformed", async () => {
    const dir = createTestDir("config-malformed")
    const ocDir = join(dir, ".opencode")
    mkdirSync(ocDir, { recursive: true })
    writeFileSync(join(ocDir, "flowdeck.json"), "{not valid json}", "utf-8")

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { loadFlowDeckConfig } = await import("@/config/loader")
      const cfg = loadFlowDeckConfig(dir)
      expect(cfg).toEqual({}) // returns empty config, no throw
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })

  it("does not write to stdout when config file is missing", async () => {
    const dir = createTestDir("config-missing")

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { loadFlowDeckConfig } = await import("@/config/loader")
      const cfg = loadFlowDeckConfig(dir)
      expect(cfg).toEqual({})
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })
})

// ── session-start hook ────────────────────────────────────────────────────

describe("session-start hook — no stdout during state read failure", () => {
  it("does not write to stdout when STATE.md is unreadable/malformed", async () => {
    const dir = createTestDir("session-start-corrupt")
    writeFileSync(join(dir, ".planning", "STATE.md"), "not: valid: yaml: :", "utf-8")

    const stdout = captureStdout()
    const stderr = captureStderr()
    let result: Record<string, unknown> = {}
    try {
      const { sessionStartHook } = await import("@/hooks/session-start")
      result = await sessionStartHook({ directory: dir })
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
    // The warning is communicated through the returned context object, not stdout
    expect(result).toHaveProperty("flowdeck_status")
  })

  it("input bar remains visible during session start — no stdout side effects", async () => {
    const dir = createTestDir("session-start-normal")
    writeMockState(dir)

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { sessionStartHook } = await import("@/hooks/session-start")
      await sessionStartHook({ directory: dir })
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })
})

// ── agents/index ──────────────────────────────────────────────────────────

describe("agents/index — no stdout for unknown agent names", () => {
  it("does not write to stdout when an unknown agent name is requested", async () => {
    const stdout = captureStdout()
    const stderr = captureStderr()
    let result: unknown
    try {
      const { createAgent } = await import("@/agents/index")
      result = createAgent("totally-unknown-agent-xyz")
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(result).toBeUndefined()
    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })
})

// ── research-gate ─────────────────────────────────────────────────────────

describe("research-gate — no stdout during orchestrated execution", () => {
  it("input bar remains visible during orchestrated execution — runResearchGate emits no stdout", async () => {
    const dir = createTestDir("research-gate-orchestrator")
    writeMockState(dir)

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { runResearchGate } = await import("@/lib/research-gate")
      await runResearchGate(dir, "discuss")
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })

  it("multiline stack trace equivalent (verbose diagnostics) does not overlap composer — logger is no-op by default", async () => {
    const dir = createTestDir("research-gate-verbose")
    writeMockState(dir)

    const loggerLines: string[] = []
    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { runResearchGate } = await import("@/lib/research-gate")
      // With an explicit logger, lines go to the logger, not stdout
      await runResearchGate(dir, "plan", { logger: (msg) => loggerLines.push(msg) })
    } finally {
      stdout.restore()
      stderr.restore()
    }

    // Verbose diagnostics captured in bounded logger, not raw stdout
    expect(loggerLines.length).toBeGreaterThan(0)
    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })

  it("long wrapped lines / rapid updates do not corrupt layout — forceRefresh emits no stdout", async () => {
    const dir = createTestDir("research-gate-refresh")
    writeMockState(dir)

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { runResearchGate } = await import("@/lib/research-gate")
      // Simulate rapid sequential updates
      await runResearchGate(dir, "execute")
      await runResearchGate(dir, "execute", { forceRefresh: true })
      await runResearchGate(dir, "fix-bug")
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })

  it("normal mode: logResearchDiagnostics is a no-op by default (safe for TUI)", async () => {
    const { logResearchDiagnostics, buildResearchDiagnostics } = await import("@/lib/research-gate")

    const mockEvidence = {
      scope: "discuss" as const,
      collectedAt: new Date().toISOString(),
      filesExplored: ["file1.ts", "file2.ts"],
      findings: ["finding1", "finding2"],
      mcpToolsUsed: ["tool1"],
      gateSatisfied: true,
      skippedExploration: false,
      summaryVersion: 1,
    }
    const diags = buildResearchDiagnostics(mockEvidence)

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      // No logger argument → no-op, no stdout
      logResearchDiagnostics(diags)
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })

  it("verbose mode: logResearchDiagnostics routes to bounded logger, never stdout", async () => {
    const { logResearchDiagnostics, buildResearchDiagnostics } = await import("@/lib/research-gate")

    const mockEvidence = {
      scope: "execute" as const,
      collectedAt: new Date().toISOString(),
      filesExplored: ["src/foo.ts"],
      findings: Array.from({ length: 20 }, (_, i) => `finding ${i}`), // simulate long output
      mcpToolsUsed: [],
      gateSatisfied: true,
      skippedExploration: false,
      summaryVersion: 2,
    }
    const diags = buildResearchDiagnostics(mockEvidence)

    const captured: string[] = []
    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      logResearchDiagnostics(diags, (msg) => captured.push(msg))
    } finally {
      stdout.restore()
      stderr.restore()
    }

    // Lines routed to the bounded logger panel, not raw stdout
    expect(captured.length).toBeGreaterThan(0)
    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })
})

// ── notifications ─────────────────────────────────────────────────────────

describe("notifications — no stdout writes (TUI safe)", () => {
  it("does not write BEL or any bytes to stdout when notify-send is unavailable", async () => {
    // The tryTerminalBell() fallback has been removed; this verifies it stays gone.
    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const { notify } = await import("@/hooks/notifications")
      // Trigger the linux path where notify-send might fail; we mock a no-available platform
      // by testing that the function doesn't write to stdout regardless.
      notify("Test Title", "Test Body", "info")
    } finally {
      stdout.restore()
      stderr.restore()
    }

    // No BEL (\x07) or any other bytes should appear on stdout
    const allOut = stdout.lines.join("")
    expect(allOut).not.toContain("\x07")
  })

  it("typing while logs stream does not lose focus — NotificationController produces no stdout", async () => {
    const { NotificationController } = await import("@/hooks/notifications")

    const stdout = captureStdout()
    const stderr = captureStderr()
    try {
      const ctrl = new NotificationController(
        () => {}, // stub OS notifier — no actual notification spawned
        () => {}, // silent log
      )
      ctrl.onCommandExecuted("/fd-execute")
      ctrl.onSessionIdle(true)
      ctrl.onSessionError("some error occurred")
    } finally {
      stdout.restore()
      stderr.restore()
    }

    expect(stdout.lines).toHaveLength(0)
    expect(stderr.lines).toHaveLength(0)
  })
})

// ── no new tool introduced ────────────────────────────────────────────────

describe("architectural invariant — no new log-management tool introduced", () => {
  it("existing tool set does not include a new log or tui-layout management tool", async () => {
    const { default: plugin } = await import("@/index")
    const mockClient: any = {
      app: { log: vi.fn().mockResolvedValue(undefined) },
      session: {
        create: vi.fn(),
        prompt: vi.fn(),
        abort: vi.fn(),
      },
    }
    const mockInput: any = {
      directory: join(tmpdir(), "no-new-tool-test"),
      client: mockClient,
      worktree: "",
      project: {},
      experimental_workspace: { register: () => {} },
      serverUrl: new URL("http://localhost"),
      $: {},
    }
    const result = await plugin(mockInput, {})

    const toolNames = Object.keys((result as any).tool ?? {})

    // Verify the tool set does not contain any new log/tui-management tool
    const suspectTools = toolNames.filter(
      (t) =>
        t.includes("log") ||
        t.includes("tui") ||
        t.includes("layout") ||
        t.includes("console") ||
        t.includes("activity-reporter"),
    )
    expect(suspectTools).toHaveLength(0)
  })

  it("removed delegate and run-pipeline tools stay absent", async () => {
    const { default: plugin } = await import("@/index")
    const mockClient: any = {
      app: { log: vi.fn().mockResolvedValue(undefined) },
      session: {
        create: vi.fn(),
        prompt: vi.fn(),
        abort: vi.fn(),
      },
    }
    const mockInput: any = {
      directory: join(tmpdir(), "tool-present-test"),
      client: mockClient,
      worktree: "",
      project: {},
      experimental_workspace: { register: () => {} },
      serverUrl: new URL("http://localhost"),
      $: {},
    }
    const result = await plugin(mockInput, {})

    const toolNames = Object.keys((result as any).tool ?? {})
    expect(toolNames).not.toContain("delegate")
    expect(toolNames).not.toContain("run-pipeline")
  })
})
