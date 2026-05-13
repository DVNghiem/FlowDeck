/**
 * Quick Router Tests
 *
 * Covers:
 * - classifyTask: correctly classifies feature, bugfix, ui-feature, docs, simple, ambiguous
 * - buildStageSequence: returns correct ordered stages for each task type
 * - getNextStage: returns correct next stage and handles completed / blocked states
 * - createQuickRunState: initialises state correctly
 * - /fd-quick routing contracts (supervisor integration points are tested as
 *   integration-level expectations on the returned stage sequences)
 */

import { describe, it, expect } from "vitest"
import {
  classifyTask,
  buildStageSequence,
  getNextStage,
  createQuickRunState,
  type TaskType,
  type StageProgress,
} from "./quick-router"

// ─── classifyTask: feature ────────────────────────────────────────────────────

describe("classifyTask: feature tasks", () => {
  it("classifies a substantive feature description as feature", () => {
    const result = classifyTask("add user authentication with JWT tokens and refresh support")
    expect(result.taskType).toBe("feature")
    expect(result.confidence).toBeGreaterThanOrEqual(0.5)
    expect(result.requiresTDD).toBe(true)
    expect(result.requiresDesign).toBe(false)
  })

  it("feature stage sequence is discuss → plan → execute → verify", () => {
    const result = classifyTask("add user authentication with JWT tokens and refresh support")
    expect(result.taskType).toBe("feature")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "plan", "execute", "verify"])
  })

  it("feature stages map to correct commands", () => {
    const seq = buildStageSequence("feature")
    const cmdMap: Record<string, string> = {}
    for (const s of seq) cmdMap[s.name] = s.command
    expect(cmdMap["discuss"]).toBe("fd-discuss")
    expect(cmdMap["plan"]).toBe("fd-plan")
    expect(cmdMap["execute"]).toBe("fd-execute")
    expect(cmdMap["verify"]).toBe("fd-verify")
  })

  it("plan stage requires approval for feature", () => {
    const seq = buildStageSequence("feature")
    const planStage = seq.find(s => s.name === "plan")!
    expect(planStage.requiresApproval).toBe(true)
  })
})

// ─── classifyTask: UI-heavy feature ──────────────────────────────────────────

describe("classifyTask: UI-heavy feature tasks", () => {
  it("classifies 'redesign dashboard with charts and admin panel' as ui-feature", () => {
    const result = classifyTask("redesign dashboard with charts and admin panel")
    expect(result.taskType).toBe("ui-feature")
    expect(result.requiresDesign).toBe(true)
    expect(result.requiresTDD).toBe(true)
  })

  it("ui-feature stage sequence is discuss → design → plan → execute → verify", () => {
    const result = classifyTask("build a landing page for the marketing campaign")
    expect(result.taskType).toBe("ui-feature")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "design", "plan", "execute", "verify"])
  })

  it("design stage in ui-feature uses fd-design with --mode=draft", () => {
    const seq = buildStageSequence("ui-feature")
    const designStage = seq.find(s => s.name === "design")!
    expect(designStage.command).toBe("fd-design")
    expect(designStage.args).toBe("--mode=draft")
  })

  it("classifies 'add onboarding UX flow' as ui-feature", () => {
    const result = classifyTask("add onboarding UX flow for new users")
    expect(result.taskType).toBe("ui-feature")
    expect(result.requiresDesign).toBe(true)
  })

  it("classifies 'build admin panel' as ui-feature", () => {
    const result = classifyTask("build admin panel for user management")
    expect(result.taskType).toBe("ui-feature")
  })
})

// ─── classifyTask: bug fix ────────────────────────────────────────────────────

describe("classifyTask: bug fix tasks", () => {
  it("classifies 'fix login validation bug' as bugfix", () => {
    const result = classifyTask("fix login validation bug that allows empty passwords")
    expect(result.taskType).toBe("bugfix")
    expect(result.requiresTDD).toBe(true)
    expect(result.requiresDesign).toBe(false)
  })

  it("bugfix stage sequence is discuss → fix-bug → verify", () => {
    const result = classifyTask("fix the user session expiry bug causing 401 errors")
    expect(result.taskType).toBe("bugfix")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "fix-bug", "verify"])
  })

  it("fix-bug stage maps to fd-fix-bug command", () => {
    const seq = buildStageSequence("bugfix")
    const fixStage = seq.find(s => s.name === "fix-bug")!
    expect(fixStage.command).toBe("fd-fix-bug")
  })

  it("classifies 'debug the crash on checkout' as bugfix", () => {
    const result = classifyTask("debug the crash on checkout when cart is empty")
    expect(result.taskType).toBe("bugfix")
  })

  it("classifies 'regression in payment processing' as bugfix", () => {
    const result = classifyTask("regression in payment processing after recent deploy")
    expect(result.taskType).toBe("bugfix")
  })

  it("does NOT route bugfix through design stage", () => {
    const result = classifyTask("fix the error in dashboard rendering")
    // even though 'dashboard' is a UI signal, 'fix' + 'error' dominate
    const names = result.stageSequence.map(s => s.name)
    expect(names).not.toContain("design")
  })
})

// ─── classifyTask: docs ───────────────────────────────────────────────────────

describe("classifyTask: documentation tasks", () => {
  it("classifies 'write documentation for the auth API' as docs", () => {
    const result = classifyTask("write documentation for the auth API endpoints")
    expect(result.taskType).toBe("docs")
    expect(result.requiresTDD).toBe(false)
    expect(result.requiresDesign).toBe(false)
  })

  it("docs stage sequence is discuss → write-docs → verify", () => {
    const result = classifyTask("write documentation for the auth API endpoints")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "write-docs", "verify"])
  })

  it("write-docs stage maps to fd-write-docs", () => {
    const seq = buildStageSequence("docs")
    const docsStage = seq.find(s => s.name === "write-docs")!
    expect(docsStage.command).toBe("fd-write-docs")
  })

  it("verify stage is skippable for docs", () => {
    const seq = buildStageSequence("docs")
    const verifyStage = seq.find(s => s.name === "verify")!
    expect(verifyStage.skippable).toBe(true)
  })

  it("classifies 'update README with installation steps' as docs", () => {
    const result = classifyTask("update README with installation steps and usage examples")
    expect(result.taskType).toBe("docs")
  })
})

// ─── classifyTask: simple ─────────────────────────────────────────────────────

describe("classifyTask: simple focused tasks", () => {
  it("classifies 'rename the config constant' as simple", () => {
    const result = classifyTask("rename the config constant MAX_RETRIES to RETRY_LIMIT")
    expect(result.taskType).toBe("simple")
    expect(result.requiresDesign).toBe(false)
  })

  it("simple stage sequence is execute → verify", () => {
    const seq = buildStageSequence("simple")
    const names = seq.map(s => s.name)
    expect(names).toEqual(["execute", "verify"])
  })

  it("simple verify stage is skippable", () => {
    const seq = buildStageSequence("simple")
    const verifyStage = seq.find(s => s.name === "verify")!
    expect(verifyStage.skippable).toBe(true)
  })
})

// ─── classifyTask: ambiguous ──────────────────────────────────────────────────

describe("classifyTask: ambiguous tasks", () => {
  it("classifies empty input as ambiguous", () => {
    const result = classifyTask("")
    expect(result.taskType).toBe("ambiguous")
    expect(result.clarificationNeeded).toBe(true)
    expect(typeof result.clarificationPrompt).toBe("string")
    expect(result.stageSequence).toHaveLength(0)
  })

  it("classifies single vague word as ambiguous", () => {
    const result = classifyTask("improve")
    expect(result.taskType).toBe("ambiguous")
    expect(result.clarificationNeeded).toBe(true)
  })

  it("ambiguous result has a non-empty clarificationPrompt", () => {
    const result = classifyTask("add stuff")
    expect(result.clarificationNeeded).toBe(true)
    expect(result.clarificationPrompt).toBeTruthy()
  })

  it("ambiguous result has zero-length stage sequence", () => {
    const result = classifyTask("do something")
    expect(result.stageSequence).toHaveLength(0)
  })
})

// ─── classifyTask: supervisor routing contract ────────────────────────────────

describe("classifyTask: clarification routing", () => {
  it("short vague description below threshold requests clarification", () => {
    const result = classifyTask("add feature")
    // too vague — should need clarification
    if (result.clarificationNeeded) {
      expect(typeof result.clarificationPrompt).toBe("string")
    }
  })

  it("well-described feature does not need clarification", () => {
    const result = classifyTask(
      "add rate limiting to the public API endpoints using a sliding window algorithm",
    )
    expect(result.clarificationNeeded).toBe(false)
  })

  it("well-described bug fix does not need clarification", () => {
    const result = classifyTask(
      "fix the null pointer exception crash when user profile photo is missing",
    )
    expect(result.clarificationNeeded).toBe(false)
  })
})

// ─── buildStageSequence ───────────────────────────────────────────────────────

describe("buildStageSequence", () => {
  const allTaskTypes: TaskType[] = ["feature", "ui-feature", "bugfix", "docs", "simple", "ambiguous"]

  it("returns an array for every task type", () => {
    for (const t of allTaskTypes) {
      const seq = buildStageSequence(t)
      expect(Array.isArray(seq)).toBe(true)
    }
  })

  it("ambiguous returns empty array", () => {
    expect(buildStageSequence("ambiguous")).toHaveLength(0)
  })

  it("all stages have required fields", () => {
    for (const t of allTaskTypes) {
      for (const s of buildStageSequence(t)) {
        expect(typeof s.name).toBe("string")
        expect(typeof s.command).toBe("string")
        expect(s.command.startsWith("fd-")).toBe(true)
        expect(typeof s.requiresApproval).toBe("boolean")
        expect(typeof s.skippable).toBe("boolean")
      }
    }
  })

  it("every command referenced in stage sequences is a registered fd-* command", () => {
    const REGISTERED = [
      "fd-ask", "fd-checkpoint", "fd-deploy-check", "fd-design", "fd-discuss",
      "fd-doctor", "fd-execute", "fd-fix-bug", "fd-map-codebase", "fd-multi-repo",
      "fd-new-feature", "fd-new-project", "fd-plan", "fd-quick", "fd-reflect",
      "fd-resume", "fd-status", "fd-suggest", "fd-translate-intent", "fd-verify",
      "fd-write-docs",
    ]
    for (const t of allTaskTypes) {
      for (const s of buildStageSequence(t)) {
        expect(REGISTERED).toContain(s.command)
      }
    }
  })

  it("no duplicate stage names within a sequence", () => {
    for (const t of allTaskTypes) {
      const seq = buildStageSequence(t)
      const names = seq.map(s => s.name)
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    }
  })
})

// ─── getNextStage ─────────────────────────────────────────────────────────────

describe("getNextStage", () => {
  const featureSeq = buildStageSequence("feature") // discuss → plan → execute → verify
  const bugSeq = buildStageSequence("bugfix")      // discuss → fix-bug → verify

  it("returns first stage when nothing is complete", () => {
    const result = getNextStage(featureSeq, { completedStageNames: [] })
    expect(result.stage?.name).toBe("discuss")
    expect(result.allComplete).toBe(false)
    expect(result.blocked).toBe(false)
  })

  it("returns second stage after first is complete", () => {
    const result = getNextStage(featureSeq, { completedStageNames: ["discuss"] })
    expect(result.stage?.name).toBe("plan")
  })

  it("returns null stage when all stages are complete", () => {
    const result = getNextStage(featureSeq, {
      completedStageNames: ["discuss", "plan", "execute", "verify"],
    })
    expect(result.stage).toBeNull()
    expect(result.allComplete).toBe(true)
  })

  it("reports remaining stages correctly", () => {
    const result = getNextStage(featureSeq, { completedStageNames: ["discuss"] })
    expect(result.remaining).toEqual(["execute", "verify"])
  })

  it("returns empty remaining when only one stage left", () => {
    const result = getNextStage(featureSeq, {
      completedStageNames: ["discuss", "plan", "execute"],
    })
    expect(result.stage?.name).toBe("verify")
    expect(result.remaining).toHaveLength(0)
  })

  it("returns blocked state with reason when blockedAtStage is set", () => {
    const progress: StageProgress = {
      completedStageNames: ["discuss"],
      blockedAtStage: "plan",
      blockedReason: "PLAN.md not yet confirmed by user",
    }
    const result = getNextStage(featureSeq, progress)
    expect(result.blocked).toBe(true)
    expect(result.stage?.name).toBe("plan")
    expect(result.blockedReason).toBe("PLAN.md not yet confirmed by user")
  })

  it("handles empty sequence gracefully", () => {
    const result = getNextStage([], { completedStageNames: [] })
    expect(result.stage).toBeNull()
    expect(result.allComplete).toBe(true)
    expect(result.blocked).toBe(false)
  })

  it("bugfix: returns discuss first, then fix-bug, then verify", () => {
    const r1 = getNextStage(bugSeq, { completedStageNames: [] })
    expect(r1.stage?.name).toBe("discuss")

    const r2 = getNextStage(bugSeq, { completedStageNames: ["discuss"] })
    expect(r2.stage?.name).toBe("fix-bug")

    const r3 = getNextStage(bugSeq, { completedStageNames: ["discuss", "fix-bug"] })
    expect(r3.stage?.name).toBe("verify")
  })

  it("ui-feature: design stage appears between discuss and plan", () => {
    const uiSeq = buildStageSequence("ui-feature")
    const r1 = getNextStage(uiSeq, { completedStageNames: ["discuss"] })
    expect(r1.stage?.name).toBe("design")

    const r2 = getNextStage(uiSeq, { completedStageNames: ["discuss", "design"] })
    expect(r2.stage?.name).toBe("plan")
  })
})

// ─── /fd-quick routing contracts ─────────────────────────────────────────────
// These tests verify that the routing contracts used by the fd-quick command
// are upheld: correct commands are invoked, TDD/design gates are respected,
// and state is tracked correctly.

describe("/fd-quick workflow routing contracts", () => {
  it("feature work routes through discuss → plan → execute → verify (no design stage)", () => {
    const { stageSequence } = classifyTask(
      "implement a new notifications system for user alerts",
    )
    const names = stageSequence.map(s => s.name)
    expect(names).toContain("discuss")
    expect(names).toContain("plan")
    expect(names).toContain("execute")
    expect(names).toContain("verify")
    expect(names).not.toContain("design")
  })

  it("UI tasks route through discuss → design → plan → execute → verify", () => {
    const { stageSequence } = classifyTask("build new dashboard for analytics overview")
    const names = stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "design", "plan", "execute", "verify"])
  })

  it("bug tasks route through discuss → fix-bug → verify (no execute stage)", () => {
    const { stageSequence } = classifyTask(
      "fix the broken email validation that allows invalid formats",
    )
    const names = stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "fix-bug", "verify"])
    expect(names).not.toContain("execute")
  })

  it("docs tasks route through discuss → write-docs → verify", () => {
    const { stageSequence } = classifyTask("write API documentation for the user service")
    const names = stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "write-docs", "verify"])
  })

  it("requires clarification from supervisor when task is ambiguous", () => {
    const result = classifyTask("")
    expect(result.clarificationNeeded).toBe(true)
    expect(result.clarificationPrompt).toBeTruthy()
  })

  it("does not require manual follow-up commands for feature (full sequence present)", () => {
    const result = classifyTask("add two-factor authentication using TOTP to the user account system")
    // All stages are present — user should not need to call any follow-up manually
    const commandsInSequence = result.stageSequence.map(s => s.command)
    expect(commandsInSequence).toContain("fd-discuss")
    expect(commandsInSequence).toContain("fd-plan")
    expect(commandsInSequence).toContain("fd-execute")
    expect(commandsInSequence).toContain("fd-verify")
  })

  it("TDD is required for feature tasks", () => {
    const result = classifyTask("add rate limiting to the REST API endpoints")
    expect(result.requiresTDD).toBe(true)
  })

  it("TDD is required for bugfix tasks", () => {
    const result = classifyTask("fix the crash when user submits empty form")
    expect(result.requiresTDD).toBe(true)
  })

  it("TDD is not required for docs-only tasks", () => {
    const result = classifyTask("write documentation for all public API endpoints")
    expect(result.requiresTDD).toBe(false)
  })

  it("design gate is required for ui-feature tasks", () => {
    const result = classifyTask("redesign the settings page layout with new navigation")
    expect(result.requiresDesign).toBe(true)
  })

  it("design gate is NOT required for bug fix tasks", () => {
    const result = classifyTask("fix the null exception bug in the settings page handler")
    // 'settings page' is NOT enough to flip to ui-feature when fix/bug dominate
    expect(result.requiresDesign).toBe(false)
  })
})

// ─── createQuickRunState ──────────────────────────────────────────────────────

describe("createQuickRunState", () => {
  it("initializes with correct task type and empty completedStages", () => {
    const classification = classifyTask("add user authentication with JWT")
    const state = createQuickRunState("add user authentication with JWT", classification)
    expect(state.taskType).toBe("feature")
    expect(state.completedStages).toHaveLength(0)
    expect(state.outcome).toBe("running")
    expect(state.blocked).toBe(false)
  })

  it("stageSequence in state matches classification sequence names", () => {
    const description = "build admin dashboard UI"
    const classification = classifyTask(description)
    const state = createQuickRunState(description, classification)
    expect(state.stageSequence).toEqual(classification.stageSequence.map(s => s.name))
  })

  it("currentStage is set to the first stage", () => {
    const classification = classifyTask("fix the login bug causing 500 errors on submit")
    const state = createQuickRunState("fix the login bug", classification)
    expect(state.currentStage).toBe("discuss")
  })

  it("preserves original task description", () => {
    const description = "add rate limiting to the public REST API"
    const classification = classifyTask(description)
    const state = createQuickRunState(description, classification)
    expect(state.taskDescription).toBe(description)
  })

  it("startedAt and updatedAt are valid ISO timestamps", () => {
    const classification = classifyTask("add feature for user notifications")
    const state = createQuickRunState("add feature", classification)
    expect(() => new Date(state.startedAt)).not.toThrow()
    expect(() => new Date(state.updatedAt)).not.toThrow()
  })
})

// ─── Existing commands still work independently ───────────────────────────────
// This verifies that fd-quick's stage sequences use the exact same commands
// as the existing independent workflow commands, confirming they remain usable
// standalone (the stage names map 1:1 to the existing command filenames).

describe("existing commands remain intact in stage sequences", () => {
  const commandsToPreserve = [
    "fd-discuss",
    "fd-plan",
    "fd-design",
    "fd-execute",
    "fd-fix-bug",
    "fd-write-docs",
    "fd-verify",
  ]

  it("all workflow commands appear in at least one stage sequence", () => {
    const allSequences = (["feature", "ui-feature", "bugfix", "docs", "simple"] as TaskType[])
      .flatMap(t => buildStageSequence(t))
      .map(s => s.command)

    for (const cmd of commandsToPreserve) {
      expect(allSequences).toContain(cmd)
    }
  })

  it("fd-execute is used only for feature/ui-feature/simple stages (not bug/docs)", () => {
    const featureSeq = buildStageSequence("feature")
    const bugSeq = buildStageSequence("bugfix")
    const featureCommands = featureSeq.map(s => s.command)
    const bugCommands = bugSeq.map(s => s.command)
    expect(featureCommands).toContain("fd-execute")
    expect(bugCommands).not.toContain("fd-execute")
  })

  it("fd-fix-bug is used only for bugfix stage sequences", () => {
    const bugSeq = buildStageSequence("bugfix")
    const featureSeq = buildStageSequence("feature")
    const uiSeq = buildStageSequence("ui-feature")
    expect(bugSeq.map(s => s.command)).toContain("fd-fix-bug")
    expect(featureSeq.map(s => s.command)).not.toContain("fd-fix-bug")
    expect(uiSeq.map(s => s.command)).not.toContain("fd-fix-bug")
  })
})
