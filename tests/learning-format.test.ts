import { describe, it, expect } from "vitest"

interface LearningDoc {
  whatWasBuilt: string
  whatWorkedWell: string
  whatWasDifficult: string
  lessons: string
  hasArchitecturalInsights: boolean
}

function parseLearningDoc(content: string): LearningDoc {
  return {
    whatWasBuilt: extractSection(content, "What Was Built"),
    whatWorkedWell: extractSection(content, "What Worked Well"),
    whatWasDifficult: extractSection(content, "What Was Difficult"),
    lessons: extractSection(content, "Lessons for Future Tasks"),
    hasArchitecturalInsights: hasSection(content, "Architectural Insights"),
  }
}

function hasSection(content: string, heading: string): boolean {
  const regex = new RegExp(`^##\\s+${heading}\\s*$`, "m")
  return regex.test(content)
}

function extractSection(content: string, heading: string): string {
  const regex = new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "m")
  const match = content.match(regex)
  return match?.[1]?.trim() || ""
}

describe("parseLearningDoc", () => {
  it("should require all learning sections", () => {
    const content = `# Learning: Add auth

## What Was Built
Authentication endpoints.

## What Worked Well
TDD approach.

## What Was Difficult
Token expiry logic.

## Lessons for Future Tasks
Use short-lived tokens.
`
    const doc = parseLearningDoc(content)
    expect(doc.whatWasBuilt).toContain("Authentication endpoints")
    expect(doc.whatWorkedWell).toContain("TDD approach")
    expect(doc.whatWasDifficult).toContain("Token expiry")
    expect(doc.lessons).toContain("short-lived tokens")
    expect(doc.hasArchitecturalInsights).toBe(false)
  })

  it("should detect architectural insights section", () => {
    const content = `# Learning: Add auth

## What Was Built
Auth.

## What Worked Well
TDD.

## What Was Difficult
None.

## Lessons for Future Tasks
Centralize auth.

## Architectural Insights
Use a dedicated auth service.
`
    const doc = parseLearningDoc(content)
    expect(doc.hasArchitecturalInsights).toBe(true)
  })
})
