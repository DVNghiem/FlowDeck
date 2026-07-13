import { describe, it, expect } from "vitest"
import { parsePlanSteps } from "../src/execute/step-parser"

const SAMPLE_PLAN = `
# Plan: Add user authentication

## Summary
Add authentication endpoints and password hashing.

## Steps

### Step 1: Add auth middleware
**Files:** src/middleware/auth.ts, tests/middleware/auth.test.ts
**What:** Implement JWT authentication middleware that validates bearer tokens.
**TDD:**
  - Test: Should return 401 for missing token
  - Verify: Run vitest, expect 1 failing test
  - Implement: Add middleware that checks Authorization header
**Done when:** Middleware test passes and rejects requests without valid token
**Coder:** backend-coder

### Step 2: Create login page
**Files:** src/pages/Login.tsx, tests/pages/Login.test.tsx
**What:** Implement login form component.
**TDD:**
  - Test: Should render email and password inputs
  - Verify: Run vitest, expect 1 failing test
  - Implement: Add Login component with form inputs
**Done when:** Login component renders both inputs and submits to API
**Coder:** frontend-coder

### Step 3: Add CI workflow
**Files:** .github/workflows/ci.yml
**What:** Add GitHub Actions workflow to run tests on PR.
**TDD:**
  - Test: Workflow should validate YAML syntax
  - Verify: Run yamllint, expect pass
  - Implement: Add workflow file
**Done when:** CI workflow triggers on pull_request
**Coder:** devops-coder
`

describe("parsePlanSteps", () => {
  it("should parse all steps from plan markdown", () => {
    const steps = parsePlanSteps(SAMPLE_PLAN)
    expect(steps).toHaveLength(3)
  })

  it("should extract title, files, what, and done_when", () => {
    const steps = parsePlanSteps(SAMPLE_PLAN)
    const firstStep = steps[0]

    expect(firstStep.title).toBe("Add auth middleware")
    expect(firstStep.files).toEqual(["src/middleware/auth.ts", "tests/middleware/auth.test.ts"])
    expect(firstStep.what).toBe("Implement JWT authentication middleware that validates bearer tokens.")
    expect(firstStep.doneWhen).toBe("Middleware test passes and rejects requests without valid token")
  })

  it("should parse TDD section", () => {
    const steps = parsePlanSteps(SAMPLE_PLAN)
    const firstStep = steps[0]

    expect(firstStep.tdd.test).toBe("Should return 401 for missing token")
    expect(firstStep.tdd.verify).toBe("Run vitest, expect 1 failing test")
    expect(firstStep.tdd.implement).toBe("Add middleware that checks Authorization header")
  })

  it("should validate coder type", () => {
    const steps = parsePlanSteps(SAMPLE_PLAN)
    expect(steps[0].coder).toBe("backend-coder")
    expect(steps[1].coder).toBe("frontend-coder")
    expect(steps[2].coder).toBe("devops-coder")
  })
})
