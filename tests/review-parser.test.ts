import { describe, it, expect } from "vitest"
import { parseReviewVerdict } from "../src/execute/review-parser"

describe("parseReviewVerdict", () => {
  it("should parse APPROVED verdict", () => {
    const output = `
Some text before.

\`\`\`review-verdict
status: APPROVED
comments: Looks good
\`\`\`

Some text after.
`
    const verdict = parseReviewVerdict(output)
    expect(verdict).not.toBeNull()
    expect(verdict?.status).toBe("APPROVED")
    expect(verdict?.comments).toContain("Looks good")
  })

  it("should parse APPROVED_WITH_NOTES verdict", () => {
    const output = `
\`\`\`review-verdict
status: APPROVED_WITH_NOTES
comments: |
  - Consider renaming 'x' to 'count'
  - Add error handling for null case
\`\`\`
`
    const verdict = parseReviewVerdict(output)
    expect(verdict?.status).toBe("APPROVED_WITH_NOTES")
    expect(verdict?.comments).toContain("Consider renaming 'x' to 'count'")
  })

  it("should parse REJECTED verdict", () => {
    const output = `
\`\`\`review-verdict
status: REJECTED
comments: |
  - File: src/auth.ts:42 - function too long
  - File: tests/auth.test.ts:15 - missing key assertion
\`\`\`
`
    const verdict = parseReviewVerdict(output)
    expect(verdict?.status).toBe("REJECTED")
    expect(verdict?.comments).toContain("File: src/auth.ts:42")
  })

  it("should return null if no verdict block", () => {
    const verdict = parseReviewVerdict("Just some text without a verdict.")
    expect(verdict).toBeNull()
  })

  it("should return null if status is missing", () => {
    const output = `
\`\`\`review-verdict
comments: Some feedback
\`\`\`
`
    const verdict = parseReviewVerdict(output)
    expect(verdict).toBeNull()
  })
})
