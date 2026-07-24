import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs"
import { basename, dirname, join } from "path"
import { homedir } from "os"
import type { ToolContext } from "@opencode-ai/plugin"
import { fdxDecisionsTool } from "@/tools/fdx-decisions"
import { topicDecisionsPath } from "@/tools/planning-state-lib"

const TMP = join(homedir(), ".test-tmp-fdx-decisions-" + process.pid)
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
  const pd = planningDir()
  if (existsSync(pd)) rmSync(pd, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  const pd = planningDir()
  if (existsSync(pd)) rmSync(pd, { recursive: true })
})

describe("fdx-decisions tool", () => {
  it("record appends a formatted block", async () => {
    const result = await fdxDecisionsTool.execute(
      { action: "record", topic: "auth", decision: "Use OAuth", rationale: "Industry standard" },
      ctx,
    )
    expect(result).toContain("Recorded decision")
    const content = readFileSync(topicDecisionsPath(TMP, "auth"), "utf-8")
    expect(content).toContain("## Use OAuth")
    expect(content).toContain("**Rationale:** Industry standard")
    expect(content).toContain("**Made by:** orchestrator")
    expect(content).toMatch(/At:\*\* \d{4}-\d{2}-\d{2}T/)
  })

  it("record with custom made_by", async () => {
    await fdxDecisionsTool.execute(
      { action: "record", topic: "auth", decision: "X", rationale: "Y", made_by: "alice" },
      ctx,
    )
    const content = readFileSync(topicDecisionsPath(TMP, "auth"), "utf-8")
    expect(content).toContain("**Made by:** alice")
  })

  it("record without decision or rationale returns error", async () => {
    const result = await fdxDecisionsTool.execute({ action: "record", topic: "auth" }, ctx)
    expect(result).toContain("Error:")
  })

  it("read on missing file returns 'does not exist yet'", async () => {
    const result = await fdxDecisionsTool.execute({ action: "read", topic: "auth" }, ctx)
    expect(result).toContain("does not exist")
  })

  it("read returns existing content", async () => {
    const path = topicDecisionsPath(TMP, "auth")
    mkdirSync(dirname(path), { recursive: true })
    await fdxDecisionsTool.execute(
      { action: "record", topic: "auth", decision: "X", rationale: "Y" },
      ctx,
    )
    const result = await fdxDecisionsTool.execute({ action: "read", topic: "auth" }, ctx)
    expect(result).toContain("## X")
  })

  it("record strips newlines from decision and rationale (markdown injection guard)", async () => {
    await fdxDecisionsTool.execute(
      { action: "record", topic: "auth", decision: "Line1\n## injected", rationale: "R1\rR2" },
      ctx,
    )
    const content = readFileSync(topicDecisionsPath(TMP, "auth"), "utf-8")
    // The decision line should be a single line — no embedded "## injected" header
    expect(content).not.toMatch(/^## injected$/m)
    expect(content.split("\n").filter((l) => l.startsWith("## ")).length).toBe(1)
  })
})
