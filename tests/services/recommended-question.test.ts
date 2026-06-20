import { describe, it, expect } from "vitest"
import {
  formatRecommendedQuestion,
  validateRecommendedQuestion,
  parseQuestionBlocks,
  toQuestionToolArgs,
  type RecommendedQuestion,
} from "@/lib/recommended-question"

describe("RecommendedQuestion formatting", () => {
  it("renders all required fields", () => {
    const q: RecommendedQuestion = {
      question: "Should this task use the design-first workflow?",
      recommendation: "Yes",
      rationale: "Task is UI-heavy and design agent is available.",
      defaultIfNoResponse: "Proceed with design-first workflow",
    }
    const formatted = formatRecommendedQuestion(q)
    expect(formatted).toContain("Question:")
    expect(formatted).toContain("Recommendation:")
    expect(formatted).toContain("Rationale:")
    expect(formatted).toContain("Default if no response:")
  })

  it("includes alternatives section when alternatives are provided", () => {
    const q: RecommendedQuestion = {
      question: "Should this task use the design-first workflow?",
      recommendation: "Yes",
      rationale: "Task is UI-heavy.",
      alternatives: ["No — use lightweight workflow"],
      defaultIfNoResponse: "Proceed with design-first workflow",
    }
    const formatted = formatRecommendedQuestion(q)
    expect(formatted).toContain("Alternatives:")
    expect(formatted).toContain("No — use lightweight workflow")
  })

  it("omits alternatives section when alternatives are absent", () => {
    const q: RecommendedQuestion = {
      question: "What is the project name?",
      recommendation: "Use the existing name from PROJECT.md",
      rationale: "PROJECT.md already contains the project name.",
      defaultIfNoResponse: "Infer from PROJECT.md",
    }
    const formatted = formatRecommendedQuestion(q)
    expect(formatted).not.toContain("Alternatives:")
  })
})

describe("validateRecommendedQuestion", () => {
  it("returns true for a valid RecommendedQuestion", () => {
    const q: RecommendedQuestion = {
      question: "Should we use TypeScript?",
      recommendation: "Yes",
      rationale: "Project already uses TypeScript.",
      defaultIfNoResponse: "Use TypeScript",
    }
    expect(validateRecommendedQuestion(q)).toBe(true)
  })

  it("returns false for a plain string question", () => {
    expect(validateRecommendedQuestion("What do you want?")).toBe(false)
  })

  it("returns false for an object missing recommendation field", () => {
    expect(validateRecommendedQuestion({ question: "Hi?", rationale: "Because" })).toBe(false)
  })

  it("returns false for an object missing rationale field", () => {
    expect(validateRecommendedQuestion({ question: "Hi?", recommendation: "Yes" })).toBe(false)
  })

  it("returns false for an object missing defaultIfNoResponse field", () => {
    expect(validateRecommendedQuestion({ question: "Hi?", recommendation: "Yes", rationale: "Because" })).toBe(false)
  })

  it("returns false for an object with empty question string", () => {
    expect(validateRecommendedQuestion({ question: "", recommendation: "Yes", rationale: "Because", defaultIfNoResponse: "X" })).toBe(false)
  })

  it("returns false for bare question patterns like 'what do you want?'", () => {
    const bare: RecommendedQuestion = {
      question: "What do you want?",
      recommendation: "Option A",
      rationale: "Because.",
      defaultIfNoResponse: "X",
    }
    expect(validateRecommendedQuestion(bare)).toBe(false)
  })

  it("returns false for null and undefined", () => {
    expect(validateRecommendedQuestion(null)).toBe(false)
    expect(validateRecommendedQuestion(undefined)).toBe(false)
  })
})

describe("parseQuestionBlocks", () => {
  it("extracts RecommendedQuestion from formatted text", () => {
    const text = `Question:
Should this task use the design-first workflow?

Recommendation:
Yes

Rationale:
Task is UI-heavy and design agent is available.

Alternatives:
No — use lightweight workflow

Default if no response:
Proceed with design-first workflow`

    const result = parseQuestionBlocks(text)
    expect(result).not.toBeNull()
    expect(result!.question).toContain("design-first workflow")
    expect(result!.recommendation).toBe("Yes")
    expect(result!.rationale).toContain("UI-heavy")
    expect(result!.alternatives).toContain("No — use lightweight workflow")
    expect(result!.defaultIfNoResponse).toContain("design-first workflow")
  })

  it("returns null for bare question text with no recommendation fields", () => {
    expect(parseQuestionBlocks("What do you want?")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseQuestionBlocks("")).toBeNull()
  })

  it("parses without alternatives section", () => {
    const text = `Question:
What is the project name?

Recommendation:
Use the existing name from PROJECT.md

Rationale:
PROJECT.md already contains the project name.

Default if no response:
Infer from PROJECT.md`

    const result = parseQuestionBlocks(text)
    expect(result).not.toBeNull()
    expect(result!.alternatives).toBeUndefined()
  })
})

describe("toQuestionToolArgs", () => {
  it("places recommendation first and appends alternatives", () => {
    const q: RecommendedQuestion = {
      question: "Should this task use the design-first workflow?",
      recommendation: "Yes",
      rationale: "Task is UI-heavy.",
      alternatives: ["No — use lightweight workflow", "Defer the decision"],
      defaultIfNoResponse: "Proceed with design-first workflow",
    }
    const args = toQuestionToolArgs(q)
    expect(args.options).toEqual([
      "Yes",
      "No — use lightweight workflow",
      "Defer the decision",
    ])
  })

  it("returns a single-option list when alternatives is empty", () => {
    const q: RecommendedQuestion = {
      question: "What is the project name?",
      recommendation: "Use the existing name from PROJECT.md",
      rationale: "PROJECT.md already contains the project name.",
      defaultIfNoResponse: "Infer from PROJECT.md",
    }
    const args = toQuestionToolArgs(q)
    expect(args.options).toEqual(["Use the existing name from PROJECT.md"])
    expect(args.options.length).toBe(1)
  })

  it("returns a single-option list when alternatives is undefined", () => {
    const q: RecommendedQuestion = {
      question: "Confirm the deployment target?",
      recommendation: "production",
      rationale: "All prior releases went to production.",
      defaultIfNoResponse: "production",
    }
    const args = toQuestionToolArgs(q)
    expect(args.options).toEqual(["production"])
  })

  it("derives a lowercase header from the first words of the question", () => {
    const q: RecommendedQuestion = {
      question: "Should we use TypeScript strict mode?",
      recommendation: "Yes",
      rationale: "Matches the rest of the codebase.",
      defaultIfNoResponse: "Enable strict",
    }
    const args = toQuestionToolArgs(q)
    expect(args.header).toBe("should we use typescript stric")
    expect(args.header.length).toBeLessThanOrEqual(30)
    expect(args.header).toMatch(/^[a-z ]+$/)
  })

  it("caps header at 30 characters", () => {
    const q: RecommendedQuestion = {
      question:
        "Do we want to enable verbose logging across the entire application stack?",
      recommendation: "Yes",
      rationale: "Helps debugging.",
      defaultIfNoResponse: "Yes",
    }
    const args = toQuestionToolArgs(q)
    expect(args.header.length).toBeLessThanOrEqual(30)
  })

  it("falls back to 'Decision' when the question has no usable words", () => {
    const q: RecommendedQuestion = {
      question: "   ",
      recommendation: "Yes",
      rationale: "Because.",
      defaultIfNoResponse: "Yes",
    }
    const args = toQuestionToolArgs(q)
    expect(args.header).toBe("decision")
  })

  it("includes question text, rationale, and default-if-no-response in the body", () => {
    const q: RecommendedQuestion = {
      question: "Use feature flags?",
      recommendation: "Yes",
      rationale: "Safer rollout.",
      defaultIfNoResponse: "Yes",
    }
    const args = toQuestionToolArgs(q)
    expect(args.question).toContain("Use feature flags?")
    expect(args.question).toContain("Rationale: Safer rollout.")
    expect(args.question).toContain("Default if no response: Yes")
  })
})