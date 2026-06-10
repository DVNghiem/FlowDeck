import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as childProcess from "child_process"
import type { SpawnSyncReturns } from "child_process"
import { createFlowDeckMcps } from "@/mcp/index"

const ORIGINAL_ENV = process.env

function spawn(status: number, stdout = "", stderr = ""): SpawnSyncReturns<string> {
  return { status, stdout, stderr, pid: 0, output: [null, stdout, stderr], signal: null }
}

function expectRemote(mcp: unknown): { url: string; enabled: boolean; headers?: Record<string, string> } {
  expect(mcp).toBeDefined()
  expect((mcp as { type: string }).type).toBe("remote")
  return mcp as { url: string; enabled: boolean; headers?: Record<string, string> }
}

function expectLocal(mcp: unknown): { command: string[]; enabled: boolean } {
  expect(mcp).toBeDefined()
  expect((mcp as { type: string }).type).toBe("local")
  return mcp as { command: string[]; enabled: boolean }
}

describe("createFlowDeckMcps", () => {
  let spawnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.FLOWDECK_DISABLE_MCP
    delete process.env.CONTEXT7_API_KEY
    delete process.env.EXA_API_KEY
    delete process.env.GITHUB_TOKEN

    // Default: all local launchers and codegraph are available
    spawnSpy = vi.spyOn(childProcess, "spawnSync")
    spawnSpy.mockImplementation((cmd: string) => {
      if (cmd === "npx" || cmd === "codegraph") {
        return spawn(0, "v1.0.0", "")
      }
      return spawn(1, "", "not found")
    })
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.restoreAllMocks()
  })

  // ── Existing remote MCPs ──────────────────────────────────────────────────

  it("includes context7 remote MCP by default", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectRemote(mcps.context7)
    expect(mcp.url).toBe("https://mcp.context7.com/mcp")
    expect(mcp.enabled).toBe(true)
  })

  it("includes websearch remote MCP by default", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectRemote(mcps.websearch)
    expect(mcp.enabled).toBe(true)
  })

  it("includes grep_app remote MCP by default", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectRemote(mcps.grep_app)
    expect(mcp.enabled).toBe(true)
  })

  it("includes github remote MCP by default", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectRemote(mcps.github)
    expect(mcp.enabled).toBe(true)
  })

  // ── New local MCPs: exact command arrays ──────────────────────────────────

  it("includes memory with exact command array", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectLocal(mcps.memory)
    expect(mcp.command).toEqual([
      "npx",
      "-y",
      "@modelcontextprotocol/server-memory",
    ])
    expect(mcp.enabled).toBe(true)
  })

  it("includes sequential-thinking with exact command array", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectLocal(mcps.sequentialThinking)
    expect(mcp.command).toEqual([
      "npx",
      "-y",
      "@modelcontextprotocol/server-sequential-thinking",
    ])
    expect(mcp.enabled).toBe(true)
  })

  it("includes magic with exact command array", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectLocal(mcps.magic)
    expect(mcp.command).toEqual([
      "npx",
      "-y",
      "@magicuidesign/mcp@latest",
    ])
    expect(mcp.enabled).toBe(true)
  })

  it("includes playwright with exact command array", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectLocal(mcps.playwright)
    expect(mcp.command).toEqual([
      "npx",
      "-y",
      "@playwright/mcp",
      "--browser",
      "chrome",
    ])
    expect(mcp.enabled).toBe(true)
  })

  it("includes token-optimizer with exact command array", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectLocal(mcps.tokenOptimizer)
    expect(mcp.command).toEqual([
      "npx",
      "-y",
      "token-optimizer-mcp",
    ])
    expect(mcp.enabled).toBe(true)
  })

  // ── FLOWDECK_DISABLE_MCP behavior ─────────────────────────────────────────

  it("excludes disabled MCPs via FLOWDECK_DISABLE_MCP", () => {
    process.env.FLOWDECK_DISABLE_MCP = "memory,sequential-thinking,magic"
    const mcps = createFlowDeckMcps()
    expect(mcps.memory).toBeUndefined()
    expect(mcps.sequentialThinking).toBeUndefined()
    expect(mcps.magic).toBeUndefined()
    expect(mcps.playwright).toBeDefined()
    expect(mcps.tokenOptimizer).toBeDefined()
  })

  it("handles spaces in FLOWDECK_DISABLE_MCP", () => {
    process.env.FLOWDECK_DISABLE_MCP = " memory , playwright "
    const mcps = createFlowDeckMcps()
    expect(mcps.memory).toBeUndefined()
    expect(mcps.playwright).toBeUndefined()
    expect(mcps.sequentialThinking).toBeDefined()
  })

  it("disables all new MCPs when listed in FLOWDECK_DISABLE_MCP", () => {
    process.env.FLOWDECK_DISABLE_MCP =
      "memory,sequential-thinking,magic,playwright,token-optimizer"
    const mcps = createFlowDeckMcps()
    expect(mcps.memory).toBeUndefined()
    expect(mcps.sequentialThinking).toBeUndefined()
    expect(mcps.magic).toBeUndefined()
    expect(mcps.playwright).toBeUndefined()
    expect(mcps.tokenOptimizer).toBeUndefined()
    // Remote MCPs should still be present
    expect(mcps.context7).toBeDefined()
    expect(mcps.websearch).toBeDefined()
  })

  // ── Context7 API key behavior ─────────────────────────────────────────────

  it("adds Authorization header when CONTEXT7_API_KEY is set", () => {
    process.env.CONTEXT7_API_KEY = "test-key-123"
    const mcps = createFlowDeckMcps()
    const mcp = expectRemote(mcps.context7)
    expect(mcp.headers).toEqual({
      Authorization: "Bearer test-key-123",
    })
  })

  it("omits Authorization header when CONTEXT7_API_KEY is not set", () => {
    const mcps = createFlowDeckMcps()
    const mcp = expectRemote(mcps.context7)
    expect(mcp.headers).toBeUndefined()
  })

  // ── Launcher availability gating ──────────────────────────────────────────

  it("excludes npx-backed MCPs when npx is not available", () => {
    spawnSpy.mockImplementation((cmd: string) => {
      if (cmd === "codegraph") {
        return spawn(0, "v1.0.0", "")
      }
      return spawn(1, "", "not found")
    })
    const mcps = createFlowDeckMcps()
    expect(mcps.memory).toBeUndefined()
    expect(mcps.sequentialThinking).toBeUndefined()
    expect(mcps.magic).toBeUndefined()
    expect(mcps.playwright).toBeUndefined()
    expect(mcps.tokenOptimizer).toBeUndefined()
    expect(mcps.codegraph).toBeDefined()
  })

  it("excludes all local MCPs when npx is not available", () => {
    spawnSpy.mockImplementation((cmd: string) => {
      if (cmd === "codegraph") {
        return spawn(0, "v1.0.0", "")
      }
      return spawn(1, "", "not found")
    })
    const mcps = createFlowDeckMcps()
    expect(mcps.memory).toBeUndefined()
    expect(mcps.sequentialThinking).toBeUndefined()
    expect(mcps.magic).toBeUndefined()
    expect(mcps.playwright).toBeUndefined()
    expect(mcps.tokenOptimizer).toBeUndefined()
    // Remote MCPs and codegraph should still be present
    expect(mcps.context7).toBeDefined()
    expect(mcps.websearch).toBeDefined()
    expect(mcps.codegraph).toBeDefined()
  })

  it("still respects FLOWDECK_DISABLE_MCP when launcher is available", () => {
    process.env.FLOWDECK_DISABLE_MCP = "memory"
    const mcps = createFlowDeckMcps()
    expect(mcps.memory).toBeUndefined()
    expect(mcps.sequentialThinking).toBeDefined()
    expect(mcps.magic).toBeDefined()
  })
})
