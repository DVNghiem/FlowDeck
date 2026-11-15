import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
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

  it("stores default loop state inside each project and ignores it", () => {
    const project = mkdtempSync(join(tmpdir(), "fd-loop-local-"))
    const event = { ...failure, cwd: project }
    processEvent(event)
    expect(loopStatePath(event)).toContain(join(project, ".fd-plan", "hooks"))
    expect(readFileSync(join(project, ".gitignore"), "utf8")).toContain("/.fd-plan/")
  })

  it("does not create project state for unrelated failures", () => {
    const project = mkdtempSync(join(tmpdir(), "fd-loop-ignored-"))
    const event = { ...failure, cwd: project, tool_input: { command: "ls" } }
    expect(processEvent(event)).toEqual({ repeatCount: 0, warning: "" })
    expect(existsSync(join(project, ".gitignore"))).toBe(false)
    expect(existsSync(join(project, ".fd-plan"))).toBe(false)
  })

  it("migrates legacy global loop state into the project without losing its count", () => {
    const home = mkdtempSync(join(tmpdir(), "fd-loop-home-"))
    const previousHome = process.env.HOME
    process.env.HOME = home
    const project = mkdtempSync(join(tmpdir(), "fd-loop-legacy-project-"))
    const event = { ...failure, cwd: project }
    const projectHash = createHash("sha256").update(project).digest("hex").slice(0, 16)
    const sessionHash = createHash("sha256").update("test-session").digest("hex").slice(0, 16)
    const legacy = join(home, ".fd-plan", "hooks", projectHash, `${sessionHash}.json`)
    mkdirSync(join(legacy, ".."), { recursive: true })
    const failureHash = createHash("sha256").update("same test failure").digest("hex")
    writeFileSync(legacy, JSON.stringify({ command: "bun test", failure: failureHash, count: 1 }))
    try {
      expect(processEvent(event).repeatCount).toBe(2)
      expect(readFileSync(loopStatePath(event), "utf8")).toContain('"count":2')
    } finally {
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
    }
  })
})
