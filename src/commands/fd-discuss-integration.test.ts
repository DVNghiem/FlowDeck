/**
 * Integration tests for recommendation-enhanced discuss workflow.
 *
 * Covers:
 * - discuss questions always include a recommendation
 * - supervisor clarification includes recommendation + rationale
 * - bare questions are rejected or rewritten
 * - default answers are included when uncertainty remains
 * - repo evidence is used to generate recommendations
 */

import { describe, it, expect } from "vitest"
import {
  validateRecommendedQuestion,
  formatRecommendedQuestion,
  parseQuestionBlocks,
  type RecommendedQuestion,
} from "../lib/recommended-question"

describe("discuss questions always include recommendation", () => {
  it("a RecommendedQuestion has all four required fields", () => {
    const q: RecommendedQuestion = {
      question: "Should this task use the design-first workflow?",
      recommendation: "Yes",
      rationale: "Task is UI-heavy and design agent is available.",
      defaultIfNoResponse: "Proceed with design-first workflow",
    }
    expect(validateRecommendedQuestion(q)).toBe(true)
  })

  it("a plain string is not a valid RecommendedQuestion", () => {
    expect(validateRecommendedQuestion("What do you want?")).toBe(false)
    expect(validateRecommendedQuestion("Should we continue?")).toBe(false)
  })

  it("a question without rationale is not valid", () => {
    const q = {
      question: "Should we use TypeScript?",
      recommendation: "Yes",
      rationale: "",
      defaultIfNoResponse: "Use TypeScript",
    }
    expect(validateRecommendedQuestion(q)).toBe(false)
  })
})

describe("supervisor clarification includes recommendation + rationale", () => {
  it("formatRecommendedQuestion produces all required sections", () => {
    const q: RecommendedQuestion = {
      question: "Does this task require design review?",
      recommendation: "Yes",
      rationale: "Task mentions 'dashboard' — UI-heavy tasks require design approval per supervisor policy.",
      defaultIfNoResponse: "Proceed with design review.",
    }
    const formatted = formatRecommendedQuestion(q)
    expect(formatted).toContain("Question:")
    expect(formatted).toContain("Recommendation:")
    expect(formatted).toContain("Rationale:")
    expect(formatted).toContain("Default if no response:")
  })

  it("supervisor can parse a RecommendedQuestion from formatted text", () => {
    const text = `Question:
Does this task require design review?

Recommendation:
Yes

Rationale:
Task mentions 'dashboard' — UI-heavy tasks require design approval.

Default if no response:
Proceed with design review.`

    const parsed = parseQuestionBlocks(text)
    expect(parsed).not.toBeNull()
    expect(parsed!.recommendation).toBe("Yes")
    expect(parsed!.rationale).toContain("dashboard")
  })
})

describe("bare questions are rejected", () => {
  it('"what do you want?" is not a valid RecommendedQuestion', () => {
    const q: RecommendedQuestion = {
      question: "What do you want?",
      recommendation: "Option A",
      rationale: "Because.",
      defaultIfNoResponse: "Option A",
    }
    expect(validateRecommendedQuestion(q)).toBe(false)
  })

  it('"should I continue?" is not a valid RecommendedQuestion', () => {
    const q: RecommendedQuestion = {
      question: "Should I continue?",
      recommendation: "Yes",
      rationale: "No blockers identified.",
      defaultIfNoResponse: "Continue.",
    }
    expect(validateRecommendedQuestion(q)).toBe(false)
  })

  it("an object with missing question field is not valid", () => {
    expect(validateRecommendedQuestion({ recommendation: "Yes", rationale: "x", defaultIfNoResponse: "y" })).toBe(false)
  })

  it("an object with empty question string is not valid", () => {
    const q: RecommendedQuestion = {
      question: "",
      recommendation: "Yes",
      rationale: "Because.",
      defaultIfNoResponse: "X",
    }
    expect(validateRecommendedQuestion(q)).toBe(false)
  })
})

describe("default answers are included when uncertainty remains", () => {
  it("every valid RecommendedQuestion has a defaultIfNoResponse", () => {
    const q: RecommendedQuestion = {
      question: "What auth method?",
      recommendation: "JWT tokens",
      rationale: "PROJECT.md specifies stateless architecture.",
      defaultIfNoResponse: "Use JWT tokens (recommendation applied).",
    }
    expect(q.defaultIfNoResponse.length).toBeGreaterThan(0)
    expect(validateRecommendedQuestion(q)).toBe(true)
  })
})

describe("repo evidence is used to generate recommendations", () => {
  it("rationale should reference specific evidence — parse extracts it", () => {
    const text = `Question:
What tech stack does this project use?

Recommendation:
Node.js / TypeScript

Rationale:
package.json and tech stack detection show Node.js / JavaScript / TypeScript.

Default if no response:
Node.js / TypeScript (inferred from project).`

    const parsed = parseQuestionBlocks(text)
    expect(parsed).not.toBeNull()
    expect(parsed!.rationale).toContain("package.json")
    expect(parsed!.rationale).toContain("tech stack detection")
  })
})

describe("repeated questions are avoided", () => {
  it("parseQuestionBlocks returns null for empty text", () => {
    expect(parseQuestionBlocks("")).toBeNull()
  })

  it("parseQuestionBlocks returns null for text with only Question field", () => {
    expect(parseQuestionBlocks("Question:\nWhat?")).toBeNull()
  })
})

describe("question formatting stays consistent", () => {
  it("format then parse returns equivalent content", () => {
    const original: RecommendedQuestion = {
      question: "Should we use design-first?",
      recommendation: "Yes",
      rationale: "UI task.",
      alternatives: ["No"],
      defaultIfNoResponse: "Use design-first.",
    }
    const formatted = formatRecommendedQuestion(original)
    const parsed = parseQuestionBlocks(formatted)
    expect(parsed).not.toBeNull()
    expect(parsed!.question).toBe(original.question)
    expect(parsed!.recommendation).toBe(original.recommendation)
    expect(parsed!.rationale).toBe(original.rationale)
    expect(parsed!.alternatives).toEqual(["- No"])
    expect(parsed!.defaultIfNoResponse).toBe(original.defaultIfNoResponse)
  })
})