import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loopStatePath, processEvent } from "../../integrations/claude-code/hooks/loop.mjs"

describe("Claude loop guard", () => {
  const root = mkdtempSync(join(tmpdir(), "fd-loop-project-"))
  const stateRoot = mkdtempSync(join(tmpdir(), "fd-loop-state-"))
  mkdirSync(join(root, "src"))
  const failure = { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "bun test" }, error: "same test failure", session_id: "test-session", cwd: root }
  const write = (file_path: string) => ({ hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path }, tool_response: {}, session_id: "test-session", cwd: root })

  it("persists repeated failure counts across calls without storing raw output", () => {
    expect(processEvent(failure, stateRoot).repeatCount).toBe(1)
    expect(processEvent(failure, stateRoot).repeatCount).toBe(2)
    expect(processEvent(failure, stateRoot).warning).toContain("repeated")
    const stored = readFileSync(loopStatePath(failure, stateRoot), "utf8")
    expect(stored).not.toContain("same test failure")
  })

  it("state and log edits do not clear identical failure detection", () => {
    processEvent(write(join(root, "STATE.md")), stateRoot)
    processEvent(write(join(root, "logs", "run.log")), stateRoot)
    processEvent(write(join(root, "checkpoint.json")), stateRoot)
    expect(processEvent(failure, stateRoot).warning).toContain("repeated")
  })

  it("a successful source edit clears the repeated failure signal", () => {
    processEvent(write(join(root, "src", "main.ts")), stateRoot)
    expect(processEvent(failure, stateRoot).repeatCount).toBe(1)
  })

  it("ignores unrelated failures and edits outside the worktree", () => {
    expect(processEvent({ ...failure, tool_input: { command: "ls" } }, stateRoot).repeatCount).toBe(0)
    processEvent(failure, stateRoot)
    processEvent(write(join(tmpdir(), "outside.ts")), stateRoot)
    expect(processEvent(failure, stateRoot).repeatCount).toBe(3)
  })
})
