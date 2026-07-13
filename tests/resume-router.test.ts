import { describe, it, expect } from "vitest"
import type { TaskStatus } from "../src/types"

interface ResumeRoute {
  message: string
  nextCommand: string
}

function getResumeRoute(status: TaskStatus): ResumeRoute {
  switch (status) {
    case "executing":
      return { message: "Resuming /fd-execute from step N", nextCommand: "/fd-execute" }
    case "awaiting_confirm":
      return { message: "Plan is ready and waiting for CONFIRM", nextCommand: "/fd-task" }
    case "qa":
      return { message: "Ready for QA", nextCommand: "/fd-qa" }
    case "awaiting_ship":
      return { message: "Ready to ship", nextCommand: "/fd-ship" }
    case "exploring":
    case "researching":
    case "planning":
      return { message: `Task was in ${status} stage`, nextCommand: "/fd-task" }
    default:
      return { message: "Unknown status", nextCommand: "/fd-task" }
  }
}

describe("getResumeRoute", () => {
  it("should route executing to /fd-execute", () => {
    const route = getResumeRoute("executing")
    expect(route.nextCommand).toBe("/fd-execute")
    expect(route.message).toContain("Resuming /fd-execute")
  })

  it("should route awaiting_confirm to /fd-task", () => {
    const route = getResumeRoute("awaiting_confirm")
    expect(route.nextCommand).toBe("/fd-task")
  })

  it("should route qa to /fd-qa", () => {
    const route = getResumeRoute("qa")
    expect(route.nextCommand).toBe("/fd-qa")
  })

  it("should route awaiting_ship to /fd-ship", () => {
    const route = getResumeRoute("awaiting_ship")
    expect(route.nextCommand).toBe("/fd-ship")
  })

  it("should route exploring, researching, planning to /fd-task", () => {
    const exploring = getResumeRoute("exploring")
    const researching = getResumeRoute("researching")
    const planning = getResumeRoute("planning")
    expect(exploring.nextCommand).toBe("/fd-task")
    expect(researching.nextCommand).toBe("/fd-task")
    expect(planning.nextCommand).toBe("/fd-task")
  })
})
