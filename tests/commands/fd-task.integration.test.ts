/**
 * Integration test: full /fd-task pipeline with mock agents.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { runFdTask } from "../../src/commands/fd-task"
import { MockAgentRuntime, setAgentRuntime } from "../../src/lib/agent-runtime"
import { readTaskState } from "../../src/lib/task-state"

describe("fd-task integration", () => {
  let tmpDir: string
  let mockRuntime: MockAgentRuntime

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "fd-task-test-"))
    mockRuntime = new MockAgentRuntime()
    setAgentRuntime(mockRuntime)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  function setupHappyPath(): void {
    mockRuntime.setMockResponse(
      "explorer",
      `<!-- exploration-summary -->
has_ui: true
needs_architect: false
topic: Add user authentication
description: JWT-based auth with OAuth2 fallback
constraints:
  - Must work with existing PostgreSQL schema
  - No new external services
<!-- /exploration-summary -->`
    )

    mockRuntime.setMockResponse(
      "researcher",
      `# Research: Add user authentication

## Codebase Context
- Existing users table in PostgreSQL
- Express.js backend

## Affected Symbols
- src/auth/login.ts
- src/auth/session.ts

## Blast Radius
- 3 files affected

## Constraints
- Use existing PostgreSQL schema
- No new external services
`
    )

    mockRuntime.setMockResponse(
      "designer",
      `# Design: Add user authentication

## Layout
- Login page with email + password
- Signup page with email + password + confirmation

## Components
- LoginForm, SignupForm
`
    )

    mockRuntime.setMockResponse(
      "planner",
      `# Plan: Add user authentication

## Summary
Add JWT-based authentication with OAuth2 fallback.

## Steps

## Step 1
Write unit tests for JWT validation

## Step 2
Implement JWT token generation

## Step 3
Add login endpoint

## Step 4
Add session middleware
`
    )
  }

  it("should run full pipeline: explore → research → design → plan", async () => {
    setupHappyPath()

    const result = await runFdTask("Add user authentication", tmpDir)

    expect(result.taskSlug).toMatch(/^add-user-authentication-[0-9a-f]{4}$/)
    expect(result.finalStatus).toBe("awaiting_confirm")
    expect(result.nextAction).toBe("WAITING_FOR_CONFIRMATION")

    // Design stage runs because hasUI: true
    expect(result.outputs.designPath).toBeTruthy()
    expect(result.outputs.planPath).toBeTruthy()

    // Check task state
    const state = await readTaskState(tmpDir, result.taskSlug)
    expect(state?.status).toBe("awaiting_confirm")
    expect(state?.hasUI).toBe(true)
    expect(state?.needsArchitect).toBe(false)
    expect(state?.stepsTotal).toBe(4)
  })

  it("should skip design stage if hasUI=false", async () => {
    mockRuntime.setMockResponse(
      "explorer",
      `<!-- exploration-summary -->
has_ui: false
needs_architect: false
<!-- /exploration-summary -->`
    )
    mockRuntime.setMockResponse("researcher", "# Research output")
    mockRuntime.setMockResponse(
      "planner",
      `# Plan

## Step 1
First step
`
    )

    const result = await runFdTask("Add database migration", tmpDir)

    expect(result.outputs.designPath).toBeUndefined()
    const state = await readTaskState(tmpDir, result.taskSlug)
    expect(state?.hasUI).toBe(false)
  })

  it("should skip architect stage if needsArchitect=false", async () => {
    setupHappyPath()

    const result = await runFdTask("Add user auth", tmpDir)

    expect(result.outputs.architectPath).toBeUndefined()
  })

  it("should run architect stage if needsArchitect=true", async () => {
    mockRuntime.setMockResponse(
      "explorer",
      `<!-- exploration-summary -->
has_ui: false
needs_architect: true
<!-- /exploration-summary -->`
    )
    mockRuntime.setMockResponse("researcher", "# Research output")
    mockRuntime.setMockResponse(
      "architect",
      `# Architecture Review

## Recommendation
Approved as-is
`
    )
    mockRuntime.setMockResponse(
      "planner",
      `# Plan

## Step 1
First step
`
    )

    const result = await runFdTask("Refactor auth service", tmpDir)

    expect(result.outputs.architectPath).toBeTruthy()
    expect(result.nextAction).not.toBe("ABORT")
  })

  it("should abort if architect recommends redesign", async () => {
    mockRuntime.setMockResponse(
      "explorer",
      `<!-- exploration-summary -->
has_ui: false
needs_architect: true
<!-- /exploration-summary -->`
    )
    mockRuntime.setMockResponse("researcher", "# Research output")
    mockRuntime.setMockResponse(
      "architect",
      `# Architecture Review

## Recommendation
**REQUIRES REDESIGN**

The proposed approach conflicts with existing service boundaries.
`
    )

    const result = await runFdTask("Refactor auth service", tmpDir)

    expect(result.nextAction).toBe("ABORT")
    expect(result.outputs.planPath).toBe("")
    expect(result.finalStatus).toBe("exploring")

    const state = await readTaskState(tmpDir, result.taskSlug)
    expect(state?.status).toBe("exploring")
    expect(state?.aborted).toBe(true)
  })

  it("should throw if task already pending", async () => {
    setupHappyPath()
    // First run
    await runFdTask("Add logging", tmpDir)

    // Second run with same topic should fail
    await expect(
      runFdTask("Add logging", tmpDir)
    ).rejects.toThrow("Pending task found")
  })

  it("should propagate explorer topic to state", async () => {
    setupHappyPath()

    const result = await runFdTask("Add user authentication", tmpDir)

    const state = await readTaskState(tmpDir, result.taskSlug)
    expect(state?.topic).toBe("Add user authentication")
  })
})
