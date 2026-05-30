import { describe, expect, it } from "vitest"
import { classifyUiTaskType, isTaskType, isUiHeavyTask, normalizeTaskType } from "@/tools/dispatch-routing"

describe("dispatch-routing UI classification", () => {
  it("detects UI-heavy prompts", () => {
    expect(isUiHeavyTask("build a landing page for conversion")).toBe(true)
    expect(isUiHeavyTask("create admin panel settings page")).toBe(true)
    expect(isUiHeavyTask("optimize backend worker retry logic")).toBe(false)
  })

  it("classifies known UI task categories", () => {
    expect(classifyUiTaskType("redesign dashboard for operators")).toBe("dashboard")
    expect(classifyUiTaskType("build a landing page")).toBe("landing-page")
    expect(classifyUiTaskType("improve mobile app onboarding screen")).toBe("mobile-app")
    expect(classifyUiTaskType("harden infrastructure scripts")).toBeNull()
  })

  it("supports design task type normalization", () => {
    expect(isTaskType("design")).toBe(true)
    expect(normalizeTaskType(undefined, "design")).toBe("design")
    expect(normalizeTaskType("design", "planner")).toBe("design")
  })
})
