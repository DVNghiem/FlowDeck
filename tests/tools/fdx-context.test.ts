import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { basename, dirname, join } from "path"
import { homedir } from "os"
import type { ToolContext } from "@opencode-ai/plugin"
import { fdxContextTool } from "@/tools/fdx-context"
import { topicContextPath } from "@/tools/planning-state-lib"

const TMP = join(homedir(), ".test-tmp-fdx-context-" + process.pid)
const ctx: ToolContext = {
  directory: TMP,
  sessionID: "test",
  messageID: "test",
  agent: "test",
  worktree: TMP,
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

function planningDir() {
  return join(homedir(), ".fd-plan", basename(TMP))
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
  // Also clean the planning dir for this TMP to avoid cross-test pollution.
  const pd = planningDir()
  if (existsSync(pd)) rmSync(pd, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  const pd = planningDir()
  if (existsSync(pd)) rmSync(pd, { recursive: true })
})

describe("fdx-context tool", () => {
  it("append creates the file and parent directories", async () => {
    const result = await fdxContextTool.execute(
      { action: "append", topic: "auth", agent: "planner", stage: "research", summary: "looked at OAuth" },
      ctx,
    )
    expect(result).toContain("Appended context entry")
    const path = topicContextPath(TMP, "auth")
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, "utf-8")
    expect(content).toContain("[research/planner] looked at OAuth")
    expect(content.endsWith("\n")).toBe(true)
  })

  it("read returns the existing content", async () => {
    const path = topicContextPath(TMP, "auth")
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "[ts] [agent] hello\n", "utf-8")
    const result = await fdxContextTool.execute({ action: "read", topic: "auth" }, ctx)
    expect(result).toContain("hello")
  })

  it("read on missing file returns 'does not exist yet'", async () => {
    const result = await fdxContextTool.execute({ action: "read", topic: "no-such-topic" }, ctx)
    expect(result).toContain("does not exist")
  })

  it("clear truncates an existing file", async () => {
    const path = topicContextPath(TMP, "auth")
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "old content", "utf-8")
    const result = await fdxContextTool.execute({ action: "clear", topic: "auth" }, ctx)
    expect(result).toContain("Cleared")
    expect(readFileSync(path, "utf-8")).toBe("")
  })

  it("clear on missing file is a noop", async () => {
    const result = await fdxContextTool.execute({ action: "clear", topic: "no-such-topic" }, ctx)
    expect(result).toContain("noop")
  })

  it("append with summary > 2000 chars truncates", async () => {
    const longSummary = "x".repeat(3000)
    const result = await fdxContextTool.execute(
      { action: "append", topic: "auth", agent: "agent", stage: "stage", summary: longSummary },
      ctx,
    )
    expect(result).toContain("Appended")
    const path = topicContextPath(TMP, "auth")
    const content = readFileSync(path, "utf-8")
    // Truncated to 2000 chars total; prefix + suffix means summary itself is < 2000.
    expect(content.length).toBeLessThanOrEqual(2200)
    expect(content).toContain("… [truncated]")
  })

  it("append without required fields returns an error", async () => {
    const result = await fdxContextTool.execute({ action: "append", topic: "auth" }, ctx)
    expect(result).toContain("Error:")
  })
})
