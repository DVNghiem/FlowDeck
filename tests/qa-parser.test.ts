import { describe, it, expect } from "vitest"

interface QaResult {
  status: "QA_PASS" | "QA_FAIL"
  tests: string
  criteria?: string
  criteriaFailed?: string[]
}

function parseQaResult(output: string): QaResult | null {
  const blockMatch = output.match(/```qa-result\s*([\s\S]*?)\s*```/)
  if (!blockMatch) return null

  const block = blockMatch[1]
  const statusMatch = block.match(/(QA_PASS|QA_FAIL)/)
  if (!statusMatch) return null

  const status = statusMatch[1] as QaResult["status"]
  const testsMatch = block.match(/tests:\s*(.+)/)
  const tests = testsMatch?.[1]?.trim() || ""

  const criteriaMatch = block.match(/criteria:\s*(.+)/)
  const criteria = criteriaMatch?.[1]?.trim()

  const failed: string[] = []
  const failedSection = block.match(/criteria_failed:\s*([\s\S]*)/)
  if (failedSection) {
    const lines = failedSection[1].split("\n")
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("-")) {
        failed.push(trimmed.replace(/^-\s*/, ""))
      }
    }
  }

  return { status, tests, criteria, criteriaFailed: failed.length > 0 ? failed : undefined }
}

describe("parseQaResult", () => {
  it("should parse QA_PASS", () => {
    const output = `
\`\`\`qa-result
QA_PASS
tests: 12 passed
criteria: all 4 step done-when criteria met
\`\`\`
`
    const result = parseQaResult(output)
    expect(result).not.toBeNull()
    expect(result?.status).toBe("QA_PASS")
    expect(result?.tests).toBe("12 passed")
    expect(result?.criteria).toBe("all 4 step done-when criteria met")
  })

  it("should parse QA_FAIL with criteria list", () => {
    const output = `
\`\`\`qa-result
QA_FAIL
tests: 10 passed, 2 failed
criteria_failed:
  - Step 2: Middleware rejects invalid tokens — actual status 500, expected 401
  - Step 4: Login form submits — submit handler not wired to API
\`\`\`
`
    const result = parseQaResult(output)
    expect(result?.status).toBe("QA_FAIL")
    expect(result?.tests).toBe("10 passed, 2 failed")
    expect(result?.criteriaFailed).toHaveLength(2)
    expect(result?.criteriaFailed?.[0]).toContain("Step 2")
    expect(result?.criteriaFailed?.[1]).toContain("Step 4")
  })

  it("should return null for missing block", () => {
    const result = parseQaResult("No QA block here.")
    expect(result).toBeNull()
  })
})
