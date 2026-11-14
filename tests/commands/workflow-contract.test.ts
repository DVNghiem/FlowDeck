import { readFileSync } from "node:fs"
import { describe, expect, it } from "bun:test"

const command = (name: string) => readFileSync(`src/commands/${name}.md`, "utf8")

describe("tiered workflow prompts", () => {
  it("derives no-argument tasks from available conversation without inventing facts", () => {
    const task = command("fd-task")
    expect(task).toContain("If `$ARGUMENTS` is empty, extract only requirements")
    expect(task).toContain("`confirmed`, `proposed`,")
    expect(task).toContain("if history is truncated")
  })

  it("supports sparse artifacts while keeping FULL review strict", () => {
    expect(command("fd-task")).toContain("FAST writes `task.md` with inline mini-plan only")
    expect(command("fd-review")).toContain("In FULL, all four are required")
    expect(command("fd-execute")).toContain("`affect.md` is optional in STANDARD")
  })

  it("separates verification from lifecycle and never commits automatically", () => {
    expect(command("fd-verify")).toContain("verification: verified")
    expect(command("fd-verify")).not.toContain("  status: verified")
    expect(command("fd-done")).toContain("Require `verification: verified`")
    expect(command("fd-done")).toContain("never run git commit, git push")
  })
})
