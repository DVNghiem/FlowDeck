import { describe, it, expect } from "vitest"
import { createAutoLearnerAgent } from "@/agents/auto-learner"

describe("auto-learner: lesson/review mode", () => {
  const agent = createAutoLearnerAgent()
  const prompt = agent.config.prompt

  it("names the agent 'auto-learner'", () => {
    expect(agent.name).toBe("auto-learner")
  })

  it("includes a lesson/review mode section", () => {
    expect(prompt).toMatch(/lesson\s*\/?\s*review mode/i)
  })

  it("lesson/review mode references review-lessons", () => {
    expect(prompt).toContain("review-lessons")
  })

  it("lesson/review mode references capture-lesson", () => {
    expect(prompt).toContain("capture-lesson")
  })

  it("lesson/review mode documents the four capture-lesson fields", () => {
    expect(prompt).toContain("context")
    expect(prompt).toContain("mistake")
    expect(prompt).toContain("lesson")
    expect(prompt).toContain("severity")
  })

  it("keeps the existing post-session skill-capture mode", () => {
    expect(prompt).toContain("Auto-learn complete")
  })
})
