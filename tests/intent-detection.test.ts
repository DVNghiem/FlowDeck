import { describe, it, expect } from "vitest"

type IntentAction = "manual_command" | "status_check" | "resume" | "start_pipeline" | "clarify"

function detectIntent(message: string, hasPendingTask: boolean): IntentAction {
  const normalized = message.trim().toLowerCase()

  // Rule 1: manual command
  if (normalized.startsWith("/fd-")) return "manual_command"

  // Rule 2: status check
  if (["status", "what's pending", "show tasks"].includes(normalized)) {
    return "status_check"
  }

  // Rule 3: resume pending task
  if (hasPendingTask && (normalized === "resume" || normalized === "continue")) {
    return "resume"
  }

  // Rule 4: task request
  const taskVerbs = ["add", "fix", "implement", "refactor", "build", "create", "update", "remove", "make"]
  const words = normalized.split(/\s+/)
  const startsWithVerb = taskVerbs.some(v => words[0] === v || normalized.startsWith(v + " "))
  if (startsWithVerb) return "start_pipeline"

  // Rule 5: ambiguous
  return "clarify"
}

describe("detectIntent", () => {
  it("treats /fd- commands as manual commands", () => {
    expect(detectIntent("/fd-task add auth", false)).toBe("manual_command")
    expect(detectIntent("/fd-status", false)).toBe("manual_command")
  })

  it("treats status keywords as status checks", () => {
    expect(detectIntent("status", false)).toBe("status_check")
    expect(detectIntent("what's pending", false)).toBe("status_check")
    expect(detectIntent("show tasks", false)).toBe("status_check")
  })

  it("resumes when pending task and user says resume/continue", () => {
    expect(detectIntent("resume", true)).toBe("resume")
    expect(detectIntent("continue", true)).toBe("resume")
  })

  it("does not resume when no pending task", () => {
    expect(detectIntent("resume", false)).toBe("clarify")
  })

  it("starts pipeline for task requests", () => {
    expect(detectIntent("Add user authentication", false)).toBe("start_pipeline")
    expect(detectIntent("Fix the login bug", false)).toBe("start_pipeline")
    expect(detectIntent("Implement a payment webhook", false)).toBe("start_pipeline")
    expect(detectIntent("Refactor the auth service", false)).toBe("start_pipeline")
  })

  it("asks for clarification when ambiguous", () => {
    expect(detectIntent("What is this?", false)).toBe("clarify")
    expect(detectIntent("How does it work?", false)).toBe("clarify")
  })
})
