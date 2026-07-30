import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync, utimesSync, statSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import type { ToolContext } from "@opencode-ai/plugin"
import { fdxValidateTool } from "@/tools/fdx-validate"
import {
  topicTaskPath,
  topicAffectPath,
  topicPlanPath,
  topicArchitecturePath,
} from "@/tools/planning-state-lib"

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

const VALID_TASK = `# Task: Demo

## Requirements
- R-01: do the thing

## Acceptance Criteria
- [ ] the thing is done

## Constraints
- none
`

const VALID_ARCHITECTURE = `# Architecture: Demo

## Approach
Do it directly.

## Components
- widget: does the thing
`

const VALID_AFFECT = `# Affect Analysis

## Affected Files
- src/widget.ts (modify)

## Risk Level
low

## Parallel Safety
### Can Parallel
- Task A: [src/widget.ts]
`

const VALID_PLAN = `# Plan: Demo

## Wave 1
- [ ] Step 1: build the widget (traces: R-01) — files: [src/widget.ts]
`

describe("fdx-validate artifacts action", () => {
  /** Write all four artifacts, replacing any named file with the given content. */
  function writeArtifacts(overrides: Partial<Record<string, string>> = {}) {
    const files: Array<[string, string, string]> = [
      ["task.md", topicTaskPath(TMP, "test-topic"), VALID_TASK],
      ["architecture.md", topicArchitecturePath(TMP, "test-topic"), VALID_ARCHITECTURE],
      ["affect.md", topicAffectPath(TMP, "test-topic"), VALID_AFFECT],
      ["plan.md", topicPlanPath(TMP, "test-topic"), VALID_PLAN],
    ]
    mkdirSync(dirname(files[0][1]), { recursive: true })
    for (const [name, path, content] of files) {
      writeFileSync(path, overrides[name] ?? content, "utf-8")
    }
  }

  async function validateArtifacts(): Promise<{ valid: boolean; errors: string[] }> {
    const raw = await fdxValidateTool.execute({ action: "artifacts", topic: "test-topic" }, ctx)
    return JSON.parse(raw as string)
  }

  it("all four valid artifacts return valid: true", async () => {
    writeArtifacts()
    const result = await validateArtifacts()
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it("task.md missing ## Requirements is reported", async () => {
    writeArtifacts({ "task.md": VALID_TASK.replace("## Requirements", "## Reqs") })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("task.md: missing ## Requirements")
  })

  it("architecture.md missing ## Components is reported", async () => {
    writeArtifacts({ "architecture.md": "# Architecture\n\n## Approach\nDo it.\n" })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("architecture.md: missing ## Components")
  })

  it("affect.md Risk Level of 'critical' is rejected", async () => {
    writeArtifacts({ "affect.md": VALID_AFFECT.replace("\nlow\n", "\ncritical\n") })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("affect.md: ## Risk Level value must be low|medium|high")
  })

  it("affect.md with no files under ## Affected Files is reported", async () => {
    writeArtifacts({ "affect.md": VALID_AFFECT.replace("- src/widget.ts (modify)\n", "") })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes("## Affected Files must list"))).toBe(true)
  })

  it("plan.md step missing traces: R- is reported", async () => {
    writeArtifacts({
      "plan.md": "# Plan\n\n## Wave 1\n- [ ] Step 1: build it — files: [src/widget.ts]\n",
    })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes("plan.md: step missing 'traces: R-'"))).toBe(true)
  })

  it("plan.md step missing files: [ is reported", async () => {
    writeArtifacts({
      "plan.md": "# Plan\n\n## Wave 1\n- [ ] Step 1: build it (traces: R-01)\n",
    })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes("plan.md: step missing 'files: ['"))).toBe(true)
  })

  it("plan.md with no ## Wave heading is reported", async () => {
    writeArtifacts({
      "plan.md": "# Plan\n\n## Steps\n- [ ] Step 1: build it (traces: R-01) — files: [a.ts]\n",
    })
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("plan.md: no '## Wave N' heading found")
  })

  it("affect.md with only ### Must Sequential is valid", async () => {
    writeArtifacts({
      "affect.md": VALID_AFFECT.replace(
        "### Can Parallel\n- Task A: [src/widget.ts]\n",
        "### Must Sequential\n- Task A: [src/widget.ts]\n",
      ),
    })
    const result = await validateArtifacts()
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it("a missing artifact file is reported", async () => {
    writeArtifacts()
    rmSync(topicArchitecturePath(TMP, "test-topic"))
    const result = await validateArtifacts()
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("architecture.md: file not found")
  })
})
