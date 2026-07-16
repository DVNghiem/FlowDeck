import { describe, it, expect } from "vitest"
import {
  PIPELINE_STAGES,
  buildGuidanceMessage,
  extractTopic,
} from "../../src/lib/orchestrator-guidance"

describe("PIPELINE_STAGES", () => {
  it("exposes 8 stages in order", () => {
    expect(PIPELINE_STAGES).toEqual([
      "explore",
      "research",
      "architect",
      "design",
      "plan",
      "execute",
      "qa",
      "ship",
    ])
  })
})

describe("buildGuidanceMessage", () => {
  it("returns /fd-task guidance for bugfix intent", () => {
    const msg = buildGuidanceMessage("bugfix", "fix login crash")
    expect(msg).toContain("/fd-task")
    expect(msg).toContain("login crash")
  })

  it("returns /fd-task guidance for ui-heavy intent", () => {
    const msg = buildGuidanceMessage("ui-heavy", "build a dashboard")
    expect(msg).toContain("/fd-task")
    expect(msg).toContain("a dashboard")
  })

  it("returns /fd-task guidance for explore intent", () => {
    const msg = buildGuidanceMessage("explore", "resume the work")
    expect(msg).toContain("/fd-task")
  })

  it("returns /fd-task guidance for docs-only intent", () => {
    const msg = buildGuidanceMessage("docs-only", "research the API")
    expect(msg).toContain("/fd-task")
  })

  it("returns status tip for trivial intent", () => {
    const msg = buildGuidanceMessage("trivial", "what is status")
    expect(msg).toContain("status")
    expect(msg).not.toContain("/fd-task")
  })

  it("returns generic guidance for unknown intent", () => {
    const msg = buildGuidanceMessage("unknown", "hello world")
    expect(msg).toContain("/fd-task")
    expect(msg).toContain("hello world")
  })

  it("falls back to placeholder when topic is empty", () => {
    const msg = buildGuidanceMessage("unknown", "")
    expect(msg).toContain("your task description")
  })
})

describe("extractTopic", () => {
  it("strips 'add ' prefix", () => {
    expect(extractTopic("add user authentication")).toBe("user authentication")
  })

  it("strips 'build ' prefix", () => {
    expect(extractTopic("build a dashboard")).toBe("a dashboard")
  })

  it("strips 'implement ' prefix", () => {
    expect(extractTopic("implement API endpoint")).toBe("API endpoint")
  })

  it("strips 'create ' prefix", () => {
    expect(extractTopic("create new skill")).toBe("new skill")
  })

  it("strips 'fix ' prefix", () => {
    expect(extractTopic("fix login bug")).toBe("login bug")
  })

  it("strips 'update ' prefix", () => {
    expect(extractTopic("update README")).toBe("README")
  })

  it("strips 'remove ' prefix", () => {
    expect(extractTopic("remove dead code")).toBe("dead code")
  })

  it("strips 'refactor ' prefix", () => {
    expect(extractTopic("refactor auth service")).toBe("auth service")
  })

  it("strips 'introduce ' prefix", () => {
    expect(extractTopic("introduce new feature")).toBe("new feature")
  })

  it("is case-insensitive", () => {
    expect(extractTopic("ADD auth")).toBe("auth")
    expect(extractTopic("Build dashboard")).toBe("dashboard")
  })

  it("returns input unchanged when no verb prefix", () => {
    expect(extractTopic("hello world")).toBe("hello world")
  })

  it("returns empty string for whitespace input", () => {
    expect(extractTopic("   ")).toBe("")
  })

  it("returns empty string for empty input", () => {
    expect(extractTopic("")).toBe("")
  })
})
