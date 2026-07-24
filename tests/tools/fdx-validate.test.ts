import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync, utimesSync, statSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import type { ToolContext } from "@opencode-ai/plugin"
import { fdxValidateTool } from "@/tools/fdx-validate"
import { topicTaskPath, topicAffectPath, topicPlanPath } from "@/tools/planning-state-lib"

const TMP = join(homedir(), ".test-tmp-fdx-validate-" + process.pid)
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

function writeValidTopic() {
  const taskPath = topicTaskPath(TMP, "test-topic")
  const affectPath = topicAffectPath(TMP, "test-topic")
  const planPath = topicPlanPath(TMP, "test-topic")
  mkdirSync(dirname(taskPath), { recursive: true })
  writeFileSync(taskPath, "# task\n", "utf-8")
  writeFileSync(affectPath, "## Affected Files\n- create src/new.ts\n", "utf-8")
  writeFileSync(planPath, "# plan\n", "utf-8")
  return dirname(taskPath)
}

function basename(p: string): string {
  return p.split("/").pop() ?? p
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

describe("fdx-validate tool", () => {
  it("returns OK for a valid topic", async () => {
    writeValidTopic()
    const result = await fdxValidateTool.execute(
      { action: "pre-execute", topic: "test-topic" },
      ctx,
    )
    expect(result).toContain("OK:")
  })

  it("missing task.md returns error", async () => {
    writeValidTopic()
    rmSync(topicTaskPath(TMP, "test-topic"))
    const result = await ffx_validate()
    expect(result).toContain("task.md missing")
  })

  it("missing affect.md returns error", async () => {
    writeValidTopic()
    rmSync(topicAffectPath(TMP, "test-topic"))
    const result = await ffx_validate()
    expect(result).toContain("affect.md missing")
  })

  it("missing plan.md returns error", async () => {
    writeValidTopic()
    rmSync(topicPlanPath(TMP, "test-topic"))
    const result = await ffx_validate()
    expect(result).toContain("plan.md missing")
  })

  it("stale plan (older than task) returns error", async () => {
    writeValidTopic()
    const taskPath = topicTaskPath(TMP, "test-topic")
    const planPath = topicPlanPath(TMP, "test-topic")
    const now = Date.now() / 1000
    // Set plan 60 seconds older than task explicitly.
    utimesSync(taskPath, now, now)
    utimesSync(planPath, now - 60, now - 60)
    const result = await ffx_validate()
    expect(result).toContain("plan.md is older than task.md")
  })

  it("modify entry pointing to nonexistent file returns error", async () => {
    writeValidTopic()
    writeFileSync(
      topicAffectPath(TMP, "test-topic"),
      "## Affected Files\n- modify src/does-not-exist.ts\n",
      "utf-8",
    )
    const result = await ffx_validate()
    expect(result).toContain("not found")
  })

  it("create entry is skipped (no existence check)", async () => {
    writeValidTopic()
    // Default affect.md has create src/new.ts — this should not error.
    const result = await ffx_validate()
    expect(result).toContain("OK:")
  })

  it("modify entry pointing to existing file passes", async () => {
    writeValidTopic()
    writeFileSync(join(TMP, "src.ts"), "// exists", "utf-8")
    writeFileSync(
      topicAffectPath(TMP, "test-topic"),
      "## Affected Files\n- modify src.ts\n",
      "utf-8",
    )
    const result = await ffx_validate()
    expect(result).toContain("OK:")
  })

  it("path with .. is refused (security)", async () => {
    writeValidTopic()
    writeFileSync(
      topicAffectPath(TMP, "test-topic"),
      "## Affected Files\n- modify ../../etc/passwd\n",
      "utf-8",
    )
    const result = await ffx_validate()
    expect(result).toContain("..")
    expect(result).toContain("refused")
  })

  it("unknown verb is caught", async () => {
    writeValidTopic()
    writeFileSync(
      topicAffectPath(TMP, "test-topic"),
      "## Affected Files\n- frobnicate src/foo.ts\n",
      "utf-8",
    )
    const result = await ffx_validate()
    expect(result).toContain("unknown verb")
  })

  it("absolute path in affect.md is taken as-is", async () => {
    writeValidTopic()
    const absoluteFile = join(TMP, "absolute.ts")
    writeFileSync(absoluteFile, "// exists", "utf-8")
    writeFileSync(
      topicAffectPath(TMP, "test-topic"),
      `## Affected Files\n- modify ${absoluteFile}\n`,
      "utf-8",
    )
    const result = await ffx_validate()
    expect(result).toContain("OK:")
  })

  async function ffx_validate() {
    return fdxValidateTool.execute({ action: "pre-execute", topic: "test-topic" }, ctx)
  }
})
