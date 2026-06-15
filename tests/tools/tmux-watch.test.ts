/**
 * Tmux Watch Tool Tests
 *
 * Covers:
 * - tmux-watch returns remediation message when tmux is unavailable
 * - tmux-watch returns message when not running inside tmux
 * - tmux-watch opens a pane when tmux is available and inside a session
 * - tmux-dashboard opens multiple panes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

let execSyncMock = vi.fn()
let execMock = vi.fn()

vi.mock("child_process", () => ({
  execSync: (...args: any[]) => execSyncMock(...args),
  exec: (...args: any[]) => execMock(...args),
}))

async function loadTmuxTools() {
  const mod = await import("@/tools/tmux-watch")
  return mod
}

describe("tmuxWatchTool", () => {
  let dir: string
  let originalTmux: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flowdeck-tmux-test-"))
    originalTmux = process.env.TMUX
    execSyncMock = vi.fn()
    execMock = vi.fn()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalTmux === undefined) delete process.env.TMUX
    else process.env.TMUX = originalTmux
    vi.clearAllMocks()
  })

  it("returns remediation when tmux is not available", async () => {
    execSyncMock.mockImplementation(() => { throw new Error("not found") })
    delete process.env.TMUX
    const { tmuxWatchTool } = await loadTmuxTools()
    const result = await tmuxWatchTool.execute({ taskId: "task-1" }, { directory: dir } as any)
    expect(result).toContain("tmux is not available")
  })

  it("returns message when not inside a tmux session", async () => {
    execSyncMock.mockReturnValue(Buffer.from("/usr/bin/tmux"))
    delete process.env.TMUX
    const { tmuxWatchTool } = await loadTmuxTools()
    const result = await tmuxWatchTool.execute({ taskId: "task-1" }, { directory: dir } as any)
    expect(result).toContain("Not running inside a tmux session")
  })

  it("opens a tmux pane when available and inside a session", async () => {
    execSyncMock.mockReturnValue(Buffer.from("/usr/bin/tmux"))
    process.env.TMUX = "flowdeck,123,0"
    const { tmuxWatchTool } = await loadTmuxTools()
    const result = await tmuxWatchTool.execute({ taskId: "task-1" }, { directory: dir } as any)
    expect(execMock).toHaveBeenCalled()
    expect(result).toContain("Opened tmux pane")
  })
})

describe("tmuxDashboardTool", () => {
  let dir: string
  let originalTmux: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flowdeck-tmux-dashboard-test-"))
    originalTmux = process.env.TMUX
    execSyncMock = vi.fn()
    execMock = vi.fn()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalTmux === undefined) delete process.env.TMUX
    else process.env.TMUX = originalTmux
    vi.clearAllMocks()
  })

  it("returns remediation when tmux is not available", async () => {
    execSyncMock.mockImplementation(() => { throw new Error("not found") })
    delete process.env.TMUX
    const { tmuxDashboardTool } = await loadTmuxTools()
    const result = await tmuxDashboardTool.execute({ tasks: ["task-1", "task-2"] }, { directory: dir } as any)
    expect(result).toContain("tmux is not available")
  })

  it("opens panes for each task when available and inside a session", async () => {
    execSyncMock.mockReturnValue(Buffer.from("/usr/bin/tmux"))
    process.env.TMUX = "flowdeck,123,0"
    const { tmuxDashboardTool } = await loadTmuxTools()
    const result = await tmuxDashboardTool.execute({ tasks: ["task-1", "task-2"] }, { directory: dir } as any)
    expect(execMock).toHaveBeenCalledTimes(3) // 2 splits + select-layout
    expect(result).toContain("Dashboard opened")
  })
})
