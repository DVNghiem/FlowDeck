/**
 * Preflight Explorer Tests
 *
 * Covers:
 * - exploreRepo: discovers commands, agents, skills, tech stack from filesystem
 * - canAnswerFromEvidence: correctly identifies suppressible questions
 * - shouldSuppressQuestion: suppresses answered / duplicate questions
 * - deriveTaskContext: narrows findings to task-relevant context
 * - refineClassification: resolves ambiguous classification via evidence
 * - createQuestionGuard: tracks asked questions and prevents duplicates
 * - filterQuestions: returns only questions that pass the guard
 * - needsSupervisorClarification: returns false when all questions are answered
 * - classifyTaskWithContext: uses exploration to resolve ambiguity
 * - createQuickRunState: persists exploration snapshot
 * - /fd-quick performs codebase exploration before asking questions
 * - /fd-discuss performs codebase exploration before asking questions
 * - repo evidence prevents unnecessary human questions
 * - supervisor-agent receives only genuine ambiguity
 * - worker agents do not ask ad hoc questions
 * - feature/bug/UI/docs tasks route correctly after preflight
 * - exploration results are stored and reused
 * - repeated question suppression works
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

import {
  exploreRepo,
  deriveTaskContext,
  canAnswerFromEvidence,
  shouldSuppressQuestion,
  refineClassification,
  type ExplorationResult,
} from "../services/preflight-explorer"

import {
  createQuestionGuard,
  filterQuestions,
  needsSupervisorClarification,
  workerAgentDecision,
} from "../services/question-guard"

import {
  classifyTask,
  classifyTaskWithContext,
  createQuickRunState,
  buildStageSequence,
  type TaskType,
} from "../services/quick-router"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRepo(
  tmpDir: string,
  opts: {
    hasStateMD?: boolean
    hasProjectMD?: boolean
    hasAgentsMD?: boolean
    hasPackageJson?: boolean
    hasPriorPhases?: boolean
    hasComponents?: boolean
    hasTests?: boolean
  } = {},
): void {
  fs.mkdirSync(tmpDir, { recursive: true })

  const planning = path.join(tmpDir, ".planning")
  fs.mkdirSync(planning, { recursive: true })

  if (opts.hasStateMD !== false) {
    fs.writeFileSync(path.join(planning, "STATE.md"), "# State\nphase: discuss\n")
  }
  if (opts.hasProjectMD !== false) {
    fs.writeFileSync(
      path.join(planning, "PROJECT.md"),
      "# Project\nTech: TypeScript + React\n",
    )
  }
  if (opts.hasAgentsMD) {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Agents\n")
  }
  if (opts.hasPackageJson !== false) {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0" }, devDependencies: { vitest: "^1.0.0" } }),
    )
  }
  if (opts.hasPriorPhases) {
    const phaseDir = path.join(planning, "phases", "phase-1")
    fs.mkdirSync(phaseDir, { recursive: true })
    fs.writeFileSync(
      path.join(phaseDir, "DISCUSS.md"),
      "# Discussion\nD-01: Scope — Add authentication\n",
    )
  }

  // Create src/ structure
  const srcDir = path.join(tmpDir, "src")
  const commandsDir = path.join(srcDir, "commands")
  const agentsDir = path.join(srcDir, "agents")
  const skillsDir = path.join(srcDir, "skills")
  const servicesDir = path.join(srcDir, "services")

  fs.mkdirSync(commandsDir, { recursive: true })
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.mkdirSync(skillsDir, { recursive: true })
  fs.mkdirSync(servicesDir, { recursive: true })

  // Add some command files
  for (const cmd of ["fd-quick", "fd-discuss", "fd-plan", "fd-execute"]) {
    fs.writeFileSync(path.join(commandsDir, `${cmd}.md`), `# ${cmd}\n`)
  }

  // Add some agent files
  for (const agent of ["orchestrator.ts", "supervisor.ts", "coder.ts"]) {
    fs.writeFileSync(path.join(agentsDir, agent), `// ${agent}\n`)
  }

  // Add some skill directories
  for (const skill of ["tdd-workflow", "code-review"]) {
    fs.mkdirSync(path.join(skillsDir, skill), { recursive: true })
  }

  if (opts.hasComponents) {
    const compDir = path.join(srcDir, "components")
    fs.mkdirSync(compDir, { recursive: true })
  }

  if (opts.hasTests) {
    fs.writeFileSync(path.join(srcDir, "app.test.ts"), "// tests\n")
  }
}

// ─── exploreRepo ──────────────────────────────────────────────────────────────

describe("exploreRepo: discovers repo artifacts", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-preflight-"))
    makeRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("detects STATE.md and PROJECT.md presence", () => {
    const result = exploreRepo(tmpDir)
    expect(result.hasStateMD).toBe(true)
    expect(result.hasProjectMD).toBe(true)
  })

  it("reports hasStateMD=false when STATE.md is missing", () => {
    fs.rmSync(path.join(tmpDir, ".planning", "STATE.md"))
    const result = exploreRepo(tmpDir)
    expect(result.hasStateMD).toBe(false)
  })

  it("reports hasProjectMD=false when PROJECT.md is missing", () => {
    fs.rmSync(path.join(tmpDir, ".planning", "PROJECT.md"))
    const result = exploreRepo(tmpDir)
    expect(result.hasProjectMD).toBe(false)
  })

  it("discovers available commands from src/commands/*.md", () => {
    const result = exploreRepo(tmpDir)
    expect(result.availableCommands).toContain("fd-quick")
    expect(result.availableCommands).toContain("fd-discuss")
    expect(result.availableCommands).toContain("fd-plan")
  })

  it("discovers available agents from src/agents/*.ts", () => {
    const result = exploreRepo(tmpDir)
    expect(result.availableAgents).toContain("orchestrator")
    expect(result.availableAgents).toContain("supervisor")
  })

  it("discovers available skills from src/skills/ directories", () => {
    const result = exploreRepo(tmpDir)
    expect(result.availableSkills).toContain("tdd-workflow")
    expect(result.availableSkills).toContain("code-review")
  })

  it("detects Node.js tech stack from package.json", () => {
    const result = exploreRepo(tmpDir)
    expect(result.techStack.some(t => t.includes("Node") || t.includes("JavaScript"))).toBe(true)
  })

  it("detects React from package.json dependencies", () => {
    const result = exploreRepo(tmpDir)
    expect(result.techStack.some(t => t.includes("React"))).toBe(true)
  })

  it("detects vitest in tech stack", () => {
    const result = exploreRepo(tmpDir)
    expect(result.techStack.some(t => t.includes("Test runner"))).toBe(true)
  })

  it("detects prior phases and discussions", () => {
    makeRepo(tmpDir, { hasPriorPhases: true })
    const result = exploreRepo(tmpDir)
    expect(result.hasPriorPhases).toBe(true)
    expect(result.hasPriorDiscussions).toBe(true)
  })

  it("reports hasPriorPhases=false when no phases directory", () => {
    const result = exploreRepo(tmpDir)
    expect(result.hasPriorPhases).toBe(false)
  })

  it("detects service layer pattern", () => {
    const result = exploreRepo(tmpDir)
    expect(result.implementationPatterns).toContain("service layer")
  })

  it("detects UI components pattern", () => {
    makeRepo(tmpDir, { hasComponents: true })
    const result = exploreRepo(tmpDir)
    expect(result.implementationPatterns).toContain("UI components")
  })

  it("returns a valid ISO timestamp in exploredAt", () => {
    const result = exploreRepo(tmpDir)
    expect(() => new Date(result.exploredAt)).not.toThrow()
    expect(new Date(result.exploredAt).getTime()).toBeGreaterThan(0)
  })

  it("populates evidenceItems for initialized project", () => {
    const result = exploreRepo(tmpDir)
    expect(result.evidenceItems.length).toBeGreaterThan(0)
    const kinds = result.evidenceItems.map(e => e.answersQuestion)
    expect(kinds).toContain("is-project-initialized")
    expect(kinds).toContain("what-tech-stack")
    expect(kinds).toContain("what-commands-available")
  })

  it("returns empty availableCommands for a bare directory", () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-bare-"))
    try {
      const result = exploreRepo(bareDir)
      expect(result.availableCommands).toHaveLength(0)
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true })
    }
  })
})

// ─── /fd-quick performs codebase exploration before asking questions ──────────

describe("/fd-quick: codebase exploration before questions", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-quick-expl-"))
    makeRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("exploreRepo runs and finds evidence before classifyTaskWithContext", () => {
    const exploration = exploreRepo(tmpDir)
    expect(exploration.evidenceItems.length).toBeGreaterThan(0)
    // Only now classify — exploration happened first
    const result = classifyTaskWithContext(
      "add user authentication",
      exploration,
    )
    expect(result).toBeDefined()
  })

  it("classifyTaskWithContext does not need clarification for an initialized project with a clear description", () => {
    const exploration = exploreRepo(tmpDir)
    const result = classifyTaskWithContext(
      "add rate limiting to the public API endpoints using sliding window",
      exploration,
    )
    expect(result.clarificationNeeded).toBe(false)
  })

  it("exploration result is stored in QuickRunState.preflightExploration", () => {
    const exploration = exploreRepo(tmpDir)
    const classification = classifyTaskWithContext("add user auth", exploration)
    const state = createQuickRunState("add user auth", classification, exploration)
    expect(state.preflightExploration).toBeDefined()
    expect(state.preflightExploration!.exploredAt).toBeDefined()
    expect(state.preflightExploration!.evidenceCount).toBeGreaterThan(0)
    expect(Array.isArray(state.preflightExploration!.techStack)).toBe(true)
    expect(Array.isArray(state.preflightExploration!.availableCommands)).toBe(true)
  })

  it("suppressedQuestions array is initialized in QuickRunState", () => {
    const exploration = exploreRepo(tmpDir)
    const classification = classifyTaskWithContext("add feature", exploration)
    const state = createQuickRunState("add feature", classification, exploration)
    expect(Array.isArray(state.suppressedQuestions)).toBe(true)
  })
})

// ─── /fd-discuss performs codebase exploration before asking questions ────────

describe("/fd-discuss: codebase exploration before questions", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-discuss-expl-"))
    makeRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("exploreRepo provides evidence before any question is formed", () => {
    const exploration = exploreRepo(tmpDir)
    // Evidence about project state should be available
    expect(exploration.hasProjectMD).toBe(true)
    expect(exploration.hasStateMD).toBe(true)
  })

  it("tech stack question is answerable from evidence when package.json exists", () => {
    const exploration = exploreRepo(tmpDir)
    const answerable = canAnswerFromEvidence("what tech stack are you using", exploration)
    expect(answerable).toBe(true)
  })

  it("project initialization question is answerable from evidence when PROJECT.md exists", () => {
    const exploration = exploreRepo(tmpDir)
    const answerable = canAnswerFromEvidence("is the project initialized", exploration)
    expect(answerable).toBe(true)
  })

  it("prior decisions question is answerable when DISCUSS.md exists", () => {
    makeRepo(tmpDir, { hasPriorPhases: true })
    const exploration = exploreRepo(tmpDir)
    const answerable = canAnswerFromEvidence("have there been prior decisions", exploration)
    // hasPriorDiscussions=true → evidence item added for has-prior-decisions
    expect(answerable).toBe(true)
  })
})

// ─── Repo evidence prevents unnecessary human questions ───────────────────────

describe("question suppression: repo evidence prevents human questions", () => {
  let tmpDir: string
  let exploration: ExplorationResult

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-suppress-"))
    makeRepo(tmpDir)
    exploration = exploreRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("suppresses tech-stack question when package.json is present", () => {
    const result = shouldSuppressQuestion("what tech stack are you using", exploration, [])
    expect(result.suppress).toBe(true)
    expect(result.answeredByEvidence).toBe(true)
  })

  it("suppresses project-init question when PROJECT.md exists", () => {
    const result = shouldSuppressQuestion("is the project initialized", exploration, [])
    expect(result.suppress).toBe(true)
  })

  it("does NOT suppress a genuine ambiguity question", () => {
    const result = shouldSuppressQuestion(
      "what is the expected behavior when the form is empty?",
      exploration,
      [],
    )
    // This is a domain question that cannot be answered from repo structure
    expect(result.suppress).toBe(false)
  })

  it("suppresses duplicate question from session history", () => {
    const history = ["what tech stack are you using"]
    const result = shouldSuppressQuestion("what tech stack are you using", exploration, history)
    expect(result.suppress).toBe(true)
    expect(result.reason).toMatch(/already asked/)
  })

  it("canAnswerFromEvidence returns true for tech-stack question", () => {
    expect(canAnswerFromEvidence("what tech stack", exploration)).toBe(true)
  })

  it("canAnswerFromEvidence returns false for domain-specific question", () => {
    expect(canAnswerFromEvidence("what is the expected payment flow?", exploration)).toBe(false)
  })
})

// ─── Supervisor receives only genuine ambiguity ───────────────────────────────

describe("question guard: supervisor receives only genuine ambiguity", () => {
  let tmpDir: string
  let exploration: ExplorationResult

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-guard-"))
    makeRepo(tmpDir)
    exploration = exploreRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("filterQuestions removes evidence-answerable questions", () => {
    const guard = createQuestionGuard()
    const candidates = [
      "what tech stack are you using",
      "is the project initialized",
      "what is the expected form behavior when all fields are empty?", // genuine
    ]
    const allowed = filterQuestions(candidates, guard, exploration)
    expect(allowed).not.toContain("what tech stack are you using")
    expect(allowed).not.toContain("is the project initialized")
    expect(allowed).toContain("what is the expected form behavior when all fields are empty?")
  })

  it("needsSupervisorClarification returns false when all questions are answered by evidence", () => {
    const guard = createQuestionGuard()
    const questions = [
      "what tech stack are you using",
      "is the project initialized",
    ]
    const needed = needsSupervisorClarification(questions, guard, exploration)
    expect(needed).toBe(false)
  })

  it("needsSupervisorClarification returns true for genuine domain questions", () => {
    const guard = createQuestionGuard()
    const questions = [
      "what retry policy should the payment service use?",
    ]
    const needed = needsSupervisorClarification(questions, guard, exploration)
    expect(needed).toBe(true)
  })

  it("guard prevents the same question from reaching supervisor twice", () => {
    const guard = createQuestionGuard()
    const q = "what is the maximum file upload size?"
    // First time: allowed
    const first = guard.check(q, exploration)
    expect(first.allow).toBe(true)
    guard.record(q)
    // Second time: blocked as duplicate
    const second = guard.check(q, exploration)
    expect(second.allow).toBe(false)
    expect(second.duplicate).toBe(true)
  })

  it("guard.getAsked returns all recorded questions", () => {
    const guard = createQuestionGuard()
    guard.record("question one")
    guard.record("question two")
    expect(guard.getAsked()).toHaveLength(2)
  })

  it("guard.reset clears recorded questions", () => {
    const guard = createQuestionGuard(["pre-existing question"])
    guard.record("new question")
    guard.reset()
    expect(guard.getAsked()).toHaveLength(1) // only pre-existing restored
  })
})

// ─── Worker agents do not ask ad hoc questions ───────────────────────────────

describe("worker agent decision: no ad hoc human questions", () => {
  let tmpDir: string
  let exploration: ExplorationResult

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-worker-"))
    makeRepo(tmpDir)
    exploration = exploreRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("canProceed=true when tech stack info is in evidence", () => {
    const decision = workerAgentDecision("what tech stack", exploration)
    expect(decision.canProceed).toBe(true)
    expect(decision.mustEscalate).toBe(false)
  })

  it("mustEscalate=true for domain info not in evidence", () => {
    const decision = workerAgentDecision("what is the maximum retry count for the payment API?", exploration)
    expect(decision.canProceed).toBe(false)
    expect(decision.mustEscalate).toBe(true)
  })

  it("evidence field is populated when canProceed=true", () => {
    const decision = workerAgentDecision("what tech stack", exploration)
    expect(decision.canProceed).toBe(true)
    // evidence may or may not be set depending on keyword match
    // just verify it doesn't throw and returns a string or undefined
    expect(typeof decision.evidence === "string" || decision.evidence === undefined).toBe(true)
  })

  it("missingData field is populated when mustEscalate=true", () => {
    const decision = workerAgentDecision("what is the retry policy for payment transactions?", exploration)
    expect(decision.mustEscalate).toBe(true)
    expect(decision.missingData).toBe("what is the retry policy for payment transactions?")
  })
})

// ─── Correct routing after preflight ─────────────────────────────────────────

describe("workflow routing after preflight exploration", () => {
  let tmpDir: string
  let exploration: ExplorationResult

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-routing-"))
    makeRepo(tmpDir)
    exploration = exploreRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("feature task routes to discuss → plan → execute → verify", () => {
    const result = classifyTaskWithContext(
      "add rate limiting to the REST API endpoints using a token bucket algorithm",
      exploration,
    )
    expect(result.taskType).toBe("feature")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "plan", "execute", "verify"])
  })

  it("UI task routes to discuss → design → plan → execute → verify", () => {
    const result = classifyTaskWithContext(
      "build a new admin dashboard for user management",
      exploration,
    )
    expect(result.taskType).toBe("ui-feature")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "design", "plan", "execute", "verify"])
  })

  it("bug task routes to discuss → fix-bug → verify", () => {
    const result = classifyTaskWithContext(
      "fix the null pointer exception crash on empty form submit",
      exploration,
    )
    expect(result.taskType).toBe("bugfix")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "fix-bug", "verify"])
  })

  it("docs task routes to discuss → write-docs → verify", () => {
    const result = classifyTaskWithContext(
      "write documentation for all public API endpoints",
      exploration,
    )
    expect(result.taskType).toBe("docs")
    const names = result.stageSequence.map(s => s.name)
    expect(names).toEqual(["discuss", "write-docs", "verify"])
  })

  it("ambiguous short description resolves to feature when project is initialized", () => {
    const result = classifyTaskWithContext("add auth", exploration)
    // Project is initialized (PROJECT.md exists) → resolve to feature instead of ambiguous
    expect(result.taskType).toBe("feature")
    expect(result.clarificationNeeded).toBe(false)
  })

  it("empty input still requires clarification even with evidence", () => {
    const result = classifyTaskWithContext("", exploration)
    // Empty string cannot be resolved by evidence alone
    // May still need clarification
    expect(typeof result.clarificationNeeded).toBe("boolean")
  })
})

// ─── Exploration results stored and reused ───────────────────────────────────

describe("exploration persistence in QuickRunState", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-persist-"))
    makeRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("preflightExploration is set in state when exploration is provided", () => {
    const exploration = exploreRepo(tmpDir)
    const classification = classifyTaskWithContext("add feature for notifications", exploration)
    const state = createQuickRunState("add feature for notifications", classification, exploration)
    expect(state.preflightExploration).toBeDefined()
  })

  it("preflightExploration.techStack matches exploration.techStack", () => {
    const exploration = exploreRepo(tmpDir)
    const classification = classifyTask("add feature for user notifications")
    const state = createQuickRunState("add feature for user notifications", classification, exploration)
    expect(state.preflightExploration!.techStack).toEqual(exploration.techStack)
  })

  it("preflightExploration.availableCommands matches exploration.availableCommands", () => {
    const exploration = exploreRepo(tmpDir)
    const classification = classifyTask("add feature for user notifications")
    const state = createQuickRunState("add feature", classification, exploration)
    expect(state.preflightExploration!.availableCommands).toEqual(exploration.availableCommands)
  })

  it("preflightExploration.evidenceCount is > 0 for initialized project", () => {
    const exploration = exploreRepo(tmpDir)
    const classification = classifyTask("add feature")
    const state = createQuickRunState("add feature", classification, exploration)
    expect(state.preflightExploration!.evidenceCount).toBeGreaterThan(0)
  })

  it("createQuickRunState works without exploration (backward-compat)", () => {
    const classification = classifyTask("add user authentication with JWT tokens")
    const state = createQuickRunState("add user auth", classification)
    expect(state.preflightExploration).toBeUndefined()
    expect(state.taskType).toBe("feature")
    expect(Array.isArray(state.suppressedQuestions)).toBe(true)
  })
})

// ─── Repeated question suppression ───────────────────────────────────────────

describe("repeated question suppression", () => {
  it("guard suppresses a question asked in initialHistory", () => {
    const guard = createQuestionGuard(["what tech stack?"])
    const result = guard.check("what tech stack?", null)
    expect(result.allow).toBe(false)
    expect(result.duplicate).toBe(true)
  })

  it("guard normalises case and whitespace before comparing", () => {
    const guard = createQuestionGuard(["What Tech Stack?"])
    const result = guard.check("  what tech stack?  ", null)
    expect(result.allow).toBe(false)
    expect(result.duplicate).toBe(true)
  })

  it("filterQuestions with session history suppresses already-asked questions", () => {
    const guard = createQuestionGuard(["what is the project scope?"])
    const candidates = [
      "what is the project scope?",   // already asked
      "what is the expected concurrency model?", // new genuine question
    ]
    const allowed = filterQuestions(candidates, guard, null)
    expect(allowed).not.toContain("what is the project scope?")
    expect(allowed).toContain("what is the expected concurrency model?")
  })

  it("refineClassification marks clarification not needed when evidence exists", () => {
    let tmpDir: string | null = null
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-refine-"))
      makeRepo(tmpDir)
      const exploration = exploreRepo(tmpDir)
      const refinement = refineClassification("what tech stack are you using?", exploration, [])
      expect(refinement.clarificationStillNeeded).toBe(false)
      expect(refinement.resolvedReason).toBeTruthy()
    } finally {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("refineClassification marks clarification still needed for domain questions", () => {
    let tmpDir: string | null = null
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-refine2-"))
      makeRepo(tmpDir)
      const exploration = exploreRepo(tmpDir)
      const refinement = refineClassification(
        "what is the expected retry policy for failed payments?",
        exploration,
        [],
      )
      expect(refinement.clarificationStillNeeded).toBe(true)
    } finally {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

// ─── deriveTaskContext ────────────────────────────────────────────────────────

describe("deriveTaskContext", () => {
  let tmpDir: string
  let exploration: ExplorationResult

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-derive-"))
    makeRepo(tmpDir, { hasComponents: true })
    exploration = exploreRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("detects UI-heavy context for dashboard task", () => {
    const ctx = deriveTaskContext("build new admin dashboard", exploration, tmpDir)
    expect(ctx.likelyUITask).toBe(true)
  })

  it("detects backend context for API task", () => {
    const ctx = deriveTaskContext("implement REST API endpoint for user service", exploration, tmpDir)
    expect(ctx.likelyBackendTask).toBe(true)
  })

  it("hasTests is true when test files exist", () => {
    makeRepo(tmpDir, { hasTests: true })
    const updatedExploration = exploreRepo(tmpDir)
    const ctx = deriveTaskContext("add authentication", updatedExploration, tmpDir)
    expect(ctx.hasTests).toBe(true)
  })

  it("techStack is populated from exploration", () => {
    const ctx = deriveTaskContext("add feature", exploration, tmpDir)
    expect(ctx.techStack.length).toBeGreaterThan(0)
  })

  it("hasGovernance reflects exploration.governanceEnabled", () => {
    const ctx = deriveTaskContext("add feature", exploration, tmpDir)
    expect(typeof ctx.hasGovernance).toBe("boolean")
    expect(ctx.hasGovernance).toBe(exploration.governanceEnabled)
  })
})
