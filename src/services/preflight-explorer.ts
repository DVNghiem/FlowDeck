/**
 * Preflight Explorer Service
 *
 * Performs autonomous codebase exploration before any clarifying question is
 * emitted to the user. Both /fd-quick and /fd-discuss run this first.
 *
 * Contract:
 *   1. exploreRepo(dir) → ExplorationResult   (what exists in the project)
 *   2. canAnswerFromEvidence(question, result) → boolean  (suppress logic)
 *   3. shouldSuppressQuestion(q, result, history) → SuppressResult
 *   4. deriveTaskContext(task, result) → DerivedTaskContext (task-relative findings)
 *
 * This module reads the filesystem synchronously so it can be used in both
 * synchronous test harnesses and async agent runtimes.
 */

import * as fs from "fs"
import * as path from "path"

export interface ExplorationResult {
  /** Whether .planning/STATE.md was found */
  hasStateMD: boolean
  /** Whether .planning/PROJECT.md was found */
  hasProjectMD: boolean
  /** Whether AGENTS.md was found at repo root */
  hasAgentsMD: boolean
  /** Whether .planning/phases/ has any prior phase directories */
  hasPriorPhases: boolean
  /** Whether .planning/phases/ has any DISCUSS.md from prior sessions */
  hasPriorDiscussions: boolean
  /** fd-* command names found on disk (from src/commands/*.md) */
  availableCommands: string[]
  /** Agent names registered in this FlowDeck installation */
  availableAgents: string[]
  /** Skill directory names found on disk (from src/skills/ subdirectories) */
  availableSkills: string[]
  /** Tech stack indicators inferred from package.json / go.mod / Cargo.toml etc. */
  techStack: string[]
  /** Config keys present in flowdeck.json if it exists */
  configKeys: string[]
  /** Rules / governance keys declared in flowdeck.json */
  governanceEnabled: boolean
  /** Implementation pattern hints inferred from src/ directory layout */
  implementationPatterns: string[]
  /** Relative paths of files that seem relevant to the task keywords */
  relevantFiles: string[]
  /** Evidence items that can answer common scoping questions */
  evidenceItems: EvidenceItem[]
  /** ISO timestamp when exploration ran */
  exploredAt: string
}

export interface EvidenceItem {
  /** The kind of question this evidence answers */
  answersQuestion: EvidenceQuestionKind
  /** Human-readable evidence summary */
  summary: string
  /** Source path (relative) */
  source: string
}

export type EvidenceQuestionKind =
  | "what-tech-stack"
  | "is-project-initialized"
  | "what-is-current-phase"
  | "what-patterns-exist"
  | "is-ui-heavy"
  | "has-existing-tests"
  | "has-existing-docs"
  | "has-ci-cd"
  | "what-agents-available"
  | "what-commands-available"
  | "what-skills-available"
  | "has-prior-decisions"
  | "has-governance"

export interface DerivedTaskContext {
  /** Whether the task appears to touch frontend/UI code based on repo evidence */
  likelyUITask: boolean
  /** Whether the task appears to touch API/backend based on repo evidence */
  likelyBackendTask: boolean
  /** Whether CI/CD config exists (relevant for deploy tasks) */
  hasCICD: boolean
  /** Whether existing tests exist in the project */
  hasTests: boolean
  /** Whether existing documentation exists */
  hasDocs: boolean
  /** Whether governance layer is active */
  hasGovernance: boolean
  /** Relevant files for this specific task */
  relevantFiles: string[]
  /** Tech stack summary */
  techStack: string[]
}

export interface SuppressResult {
  /** Whether the question should be suppressed */
  suppress: boolean
  /** Reason for suppression (if suppressed) */
  reason?: string
  /** True when the question was answered by repo evidence (vs. session dedup) */
  answeredByEvidence?: boolean
  /** The evidence that answers the question (if suppressed) */
  evidence?: EvidenceItem[]
}

// ─── Evidence question keywords ───────────────────────────────────────────────

const QUESTION_KIND_PATTERNS: Array<{ kind: EvidenceQuestionKind; patterns: string[] }> = [
  {
    kind: "what-tech-stack",
    patterns: ["tech stack", "language", "framework", "what are you using", "what tech", "built with", "written in"],
  },
  {
    kind: "is-project-initialized",
    patterns: ["initialized", "set up", "project created", "run /fd-new-project", "new project"],
  },
  {
    kind: "what-is-current-phase",
    patterns: ["current phase", "which phase", "what phase", "where are we", "current state"],
  },
  {
    kind: "what-patterns-exist",
    patterns: ["existing pattern", "how is it done", "how does the codebase", "pattern used", "architecture"],
  },
  {
    kind: "is-ui-heavy",
    patterns: ["ui", "frontend", "user interface", "webpage", "web app", "dashboard", "landing page", "screen"],
  },
  {
    kind: "has-existing-tests",
    patterns: ["test", "spec", "coverage", "tdd", "regression"],
  },
  {
    kind: "has-existing-docs",
    patterns: ["docs", "documentation", "readme", "api docs"],
  },
  {
    kind: "has-ci-cd",
    patterns: ["ci/cd", "continuous integration", "deploy", "pipeline", "github actions", ".github/workflow"],
  },
  {
    kind: "what-agents-available",
    patterns: ["which agent", "available agent", "what agent"],
  },
  {
    kind: "what-commands-available",
    patterns: ["which command", "available command", "what command", "slash command"],
  },
  {
    kind: "what-skills-available",
    patterns: ["skill", "available skill"],
  },
  {
    kind: "has-prior-decisions",
    patterns: ["prior decision", "previous discussion", "what was decided", "earlier session", "previous phase"],
  },
  {
    kind: "has-governance",
    patterns: ["governance", "policy", "approval", "supervisor"],
  },
]

/**
 * Explore the repository at `dir` and return structured findings.
 * All filesystem reads are synchronous so this can be called in test harnesses.
 *
 * @param dir - Absolute path to repo root (or closest available directory)
 */
export function exploreRepo(dir: string): ExplorationResult {
  const now = new Date().toISOString()

  const planningDir = path.join(dir, ".planning")
  const hasStateMD = fileExists(path.join(planningDir, "STATE.md"))
  const hasProjectMD = fileExists(path.join(planningDir, "PROJECT.md"))
  const hasAgentsMD = fileExists(path.join(dir, "AGENTS.md")) || fileExists(path.join(dir, "CLAUDE.md"))

  const phasesDir = path.join(planningDir, "phases")
  let hasPriorPhases = false
  let hasPriorDiscussions = false

  if (dirExists(phasesDir)) {
    try {
      const phaseDirs = fs.readdirSync(phasesDir).filter(e => e.startsWith("phase-"))
      hasPriorPhases = phaseDirs.length > 0
      hasPriorDiscussions = phaseDirs.some(p =>
        fileExists(path.join(phasesDir, p, "DISCUSS.md")),
      )
    } catch {
      // ignore read errors
    }
  }

  const availableCommands = discoverCommands(dir)

  const availableAgents = discoverAgents(dir)

  const availableSkills = discoverSkills(dir)

  const techStack = detectTechStack(dir)

  const { configKeys, governanceEnabled } = readFlowDeckConfig(dir)

  const implementationPatterns = detectImplementationPatterns(dir)

  const evidenceItems = buildEvidenceItems({
    dir,
    hasStateMD,
    hasProjectMD,
    hasAgentsMD,
    hasPriorPhases,
    hasPriorDiscussions,
    availableCommands,
    availableAgents,
    availableSkills,
    techStack,
    governanceEnabled,
    implementationPatterns,
  })

  return {
    hasStateMD,
    hasProjectMD,
    hasAgentsMD,
    hasPriorPhases,
    hasPriorDiscussions,
    availableCommands,
    availableAgents,
    availableSkills,
    techStack,
    configKeys,
    governanceEnabled,
    implementationPatterns,
    relevantFiles: [],
    evidenceItems,
    exploredAt: now,
  }
}

/**
 * Narrow the exploration result to what is specifically relevant for a given task.
 * Populates `relevantFiles` based on task keywords.
 */
export function deriveTaskContext(
  taskDescription: string,
  result: ExplorationResult,
  dir: string,
): DerivedTaskContext {
  const lower = taskDescription.toLowerCase()

  const UI_KEYWORDS = [
    "dashboard", "landing page", "ui", "ux", "frontend", "component",
    "page", "screen", "layout", "responsive", "modal", "sidebar", "navbar",
    "admin panel", "onboarding", "wireframe", "design system",
  ]
  const BACKEND_KEYWORDS = [
    "api", "endpoint", "database", "service", "backend", "server",
    "auth", "authentication", "authorization", "migration", "model",
  ]
  const CI_KEYWORDS = ["deploy", "pipeline", "ci", "cd", "release", "workflow"]
  const TEST_KEYWORDS = ["test", "spec", "coverage", "tdd", "regression"]
  const DOCS_KEYWORDS = ["docs", "documentation", "readme", "api docs", "jsdoc"]

  const likelyUITask = UI_KEYWORDS.some(k => lower.includes(k))
  const likelyBackendTask = BACKEND_KEYWORDS.some(k => lower.includes(k))
  const hasCICD = CI_KEYWORDS.some(k => lower.includes(k)) ||
    fileExists(path.join(dir, ".github", "workflows")) ||
    fileExists(path.join(dir, ".gitlab-ci.yml"))
  const hasTests = TEST_KEYWORDS.some(k => lower.includes(k)) || detectHasTests(dir)
  const hasDocs = DOCS_KEYWORDS.some(k => lower.includes(k)) || fileExists(path.join(dir, "docs"))

  const relevantFiles = findRelevantFiles(dir, taskDescription)

  return {
    likelyUITask,
    likelyBackendTask,
    hasCICD,
    hasTests,
    hasDocs,
    hasGovernance: result.governanceEnabled,
    relevantFiles,
    techStack: result.techStack,
  }
}

/**
 * Determine whether a candidate question should be suppressed because it can
 * already be answered from repo evidence.
 *
 * A question is suppressed when:
 *   1. The repo contains direct evidence that answers it, OR
 *   2. It was already asked in the current session history, OR
 *   3. It is a trivially answerable question given known project state
 */
export function shouldSuppressQuestion(
  question: string,
  result: ExplorationResult,
  sessionHistory: string[],
): SuppressResult {
  const lower = question.toLowerCase()

  const alreadyAsked = sessionHistory.some(
    h => h.toLowerCase().trim() === lower.trim(),
  )
  if (alreadyAsked) {
    return {
      suppress: true,
      reason: "This question was already asked in the current session.",
    }
  }

  const matchedEvidence = result.evidenceItems.filter(ev => {
    const qKind = classifyQuestionKind(lower)
    return qKind !== null && qKind === ev.answersQuestion
  })

  if (matchedEvidence.length > 0) {
    return {
      suppress: true,
      answeredByEvidence: true,
      reason: `Answered by repo evidence: ${matchedEvidence.map(e => e.summary).join("; ")}`,
      evidence: matchedEvidence,
    }
  }

  return { suppress: false }
}

/**
 * Check if a specific question can be answered from the exploration result alone.
 */
export function canAnswerFromEvidence(
  question: string,
  result: ExplorationResult,
): boolean {
  const kind = classifyQuestionKind(question.toLowerCase())
  if (!kind) return false
  return result.evidenceItems.some(e => e.answersQuestion === kind)
}

/**
 * Attempt to resolve a `clarificationNeeded` classification using exploration
 * context. Returns an updated `clarificationNeeded` flag and an optional
 * resolved task type hint.
 *
 * Called by quick-router after classifyTask when clarificationNeeded=true.
 */
export interface ExplorationRefinement {
  /** Whether clarification is still required after applying exploration data */
  clarificationStillNeeded: boolean
  /** Reason clarification is no longer needed (if resolved) */
  resolvedReason?: string
  /**
   * Evidence-based context to pass to @supervisor if clarification is still needed.
   * This lets the supervisor ask a tighter question.
   */
  supervisorContext?: string
}

export function refineClassification(
  clarificationPrompt: string,
  result: ExplorationResult,
  sessionHistory: string[],
): ExplorationRefinement {
  const promptLower = clarificationPrompt.toLowerCase()

  // If the project is initialized and the prompt is asking about task TYPE
  // (generic disambiguation — "is it a feature, bug fix, UI change, docs?"),
  // we can default to feature instead of interrupting the human.
  const isTaskTypeQuestion =
    result.hasProjectMD &&
    (promptLower.includes("new feature") ||
      promptLower.includes("bug fix") ||
      promptLower.includes("ui change") ||
      promptLower.includes("documentation") ||
      promptLower.includes("describe the task") ||
      promptLower.includes("more detail"))

  if (isTaskTypeQuestion) {
    return {
      clarificationStillNeeded: false,
      resolvedReason:
        "PROJECT.md exists — project is initialized. Defaulting ambiguous task to feature.",
    }
  }

  const suppress = shouldSuppressQuestion(clarificationPrompt, result, sessionHistory)

  if (suppress.suppress) {
    return {
      clarificationStillNeeded: false,
      resolvedReason: suppress.reason,
    }
  }

  // Build supervisor context from exploration findings
  const lines: string[] = []
  if (result.hasProjectMD) lines.push("PROJECT.md is present (project is initialized).")
  if (result.hasStateMD) lines.push("STATE.md is present (project has active session).")
  if (result.hasPriorDiscussions) lines.push("Prior DISCUSS.md files exist.")
  if (result.techStack.length > 0) lines.push(`Tech stack: ${result.techStack.join(", ")}.`)
  if (result.implementationPatterns.length > 0) {
    lines.push(`Implementation patterns: ${result.implementationPatterns.join(", ")}.`)
  }

  return {
    clarificationStillNeeded: true,
    supervisorContext: lines.length > 0 ? lines.join(" ") : undefined,
  }
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile() || fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function discoverCommands(dir: string): string[] {
  const commandsDir = path.join(dir, "src", "commands")
  if (!dirExists(commandsDir)) return []
  try {
    return fs.readdirSync(commandsDir)
      .filter(f => f.endsWith(".md"))
      .map(f => f.replace(/\.md$/, ""))
  } catch {
    return []
  }
}

function discoverAgents(dir: string): string[] {
  const agentsDir = path.join(dir, "src", "agents")
  if (!dirExists(agentsDir)) return []
  try {
    return fs.readdirSync(agentsDir)
      .filter(f => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts")
      .map(f => f.replace(/\.ts$/, ""))
  } catch {
    return []
  }
}

function discoverSkills(dir: string): string[] {
  const skillsDir = path.join(dir, "src", "skills")
  if (!dirExists(skillsDir)) return []
  try {
    return fs.readdirSync(skillsDir).filter(e => {
      try {
        return fs.statSync(path.join(skillsDir, e)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function detectTechStack(dir: string): string[] {
  const stack: string[] = []

  const pkgPath = path.join(dir, "package.json")
  if (fileExists(pkgPath)) {
    stack.push("Node.js / JavaScript / TypeScript")
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps["react"] || deps["@types/react"]) stack.push("React")
      if (deps["vue"] || deps["@vue/core"]) stack.push("Vue.js")
      if (deps["next"]) stack.push("Next.js")
      if (deps["express"] || deps["fastify"] || deps["hapi"]) stack.push("Node HTTP server")
      if (deps["vitest"] || deps["jest"] || deps["mocha"]) stack.push("Test runner")
      if (deps["bun"]) stack.push("Bun")
    } catch {
      // ignore parse errors
    }
  }

  if (fileExists(path.join(dir, "go.mod"))) stack.push("Go")
  if (fileExists(path.join(dir, "Cargo.toml"))) stack.push("Rust")
  if (fileExists(path.join(dir, "pyproject.toml")) || fileExists(path.join(dir, "requirements.txt"))) {
    stack.push("Python")
  }
  if (fileExists(path.join(dir, "pom.xml")) || fileExists(path.join(dir, "build.gradle"))) {
    stack.push("Java / JVM")
  }

  return stack
}

function readFlowDeckConfig(dir: string): { configKeys: string[]; governanceEnabled: boolean } {
  const configPath = path.join(dir, "flowdeck.json")
  if (!fileExists(configPath)) return { configKeys: [], governanceEnabled: false }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
    const keys = Object.keys(config)
    const governanceEnabled = "governance" in config && config.governance !== null
    return { configKeys: keys, governanceEnabled }
  } catch {
    return { configKeys: [], governanceEnabled: false }
  }
}

function detectImplementationPatterns(dir: string): string[] {
  const patterns: string[] = []
  const srcDir = path.join(dir, "src")
  if (!dirExists(srcDir)) return patterns

  try {
    const entries = fs.readdirSync(srcDir)
    if (entries.includes("services")) patterns.push("service layer")
    if (entries.includes("hooks")) patterns.push("hooks")
    if (entries.includes("components")) patterns.push("UI components")
    if (entries.includes("api") || entries.includes("routes")) patterns.push("API routes")
    if (entries.includes("models") || entries.includes("entities")) patterns.push("data models")
    if (entries.includes("agents")) patterns.push("agent architecture")
    if (entries.includes("skills")) patterns.push("skills pattern")
    if (entries.includes("commands")) patterns.push("command pattern")
  } catch {
    // ignore
  }

  return patterns
}

function detectHasTests(dir: string): boolean {
  const testDirs = ["tests", "test", "__tests__", "spec"]
  for (const d of testDirs) {
    if (dirExists(path.join(dir, d))) return true
  }
  // check src for *.test.ts files
  const srcDir = path.join(dir, "src")
  if (!dirExists(srcDir)) return false
  try {
    return walkForPattern(srcDir, /\.test\.[jt]sx?$/, 2)
  } catch {
    return false
  }
}

function walkForPattern(dir: string, pattern: RegExp, depth: number): boolean {
  if (depth < 0) return false
  try {
    const entries = fs.readdirSync(dir)
    for (const e of entries) {
      if (pattern.test(e)) return true
      if (depth > 0) {
        const full = path.join(dir, e)
        try {
          if (fs.statSync(full).isDirectory() && walkForPattern(full, pattern, depth - 1)) {
            return true
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return false
}

function findRelevantFiles(dir: string, task: string): string[] {
  // Extract keywords from the task description (nouns, identifiers)
  const keywords = task
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 6)

  if (keywords.length === 0) return []

  const found: string[] = []
  const srcDir = path.join(dir, "src")
  if (!dirExists(srcDir)) return found

  try {
    walkForKeywords(srcDir, keywords, found, 3, dir)
  } catch {
    // ignore
  }

  return found.slice(0, 10)
}

const STOP_WORDS = new Set([
  "with", "that", "this", "from", "into", "when", "then", "will", "have",
  "been", "does", "should", "would", "could", "after", "before", "about",
])

function walkForKeywords(
  dir: string,
  keywords: string[],
  found: string[],
  depth: number,
  repoRoot: string,
): void {
  if (depth < 0 || found.length >= 10) return
  try {
    const entries = fs.readdirSync(dir)
    for (const e of entries) {
      if (found.length >= 10) return
      const lower = e.toLowerCase()
      if (keywords.some(k => lower.includes(k))) {
        found.push(path.relative(repoRoot, path.join(dir, e)))
      }
      if (depth > 0) {
        const full = path.join(dir, e)
        try {
          if (fs.statSync(full).isDirectory()) {
            walkForKeywords(full, keywords, found, depth - 1, repoRoot)
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

function buildEvidenceItems(ctx: {
  dir: string
  hasStateMD: boolean
  hasProjectMD: boolean
  hasAgentsMD: boolean
  hasPriorPhases: boolean
  hasPriorDiscussions: boolean
  availableCommands: string[]
  availableAgents: string[]
  availableSkills: string[]
  techStack: string[]
  governanceEnabled: boolean
  implementationPatterns: string[]
}): EvidenceItem[] {
  const items: EvidenceItem[] = []

  if (ctx.hasProjectMD) {
    items.push({
      answersQuestion: "is-project-initialized",
      summary: "PROJECT.md exists — project is initialized and has stated goals.",
      source: ".planning/PROJECT.md",
    })
  }

  if (ctx.hasStateMD) {
    items.push({
      answersQuestion: "what-is-current-phase",
      summary: "STATE.md exists — current phase and progress are recorded.",
      source: ".planning/STATE.md",
    })
  }

  if (ctx.techStack.length > 0) {
    items.push({
      answersQuestion: "what-tech-stack",
      summary: `Tech stack detected: ${ctx.techStack.join(", ")}.`,
      source: "package.json / build files",
    })
  }

  if (ctx.availableCommands.length > 0) {
    items.push({
      answersQuestion: "what-commands-available",
      summary: `${ctx.availableCommands.length} commands available: ${ctx.availableCommands.slice(0, 5).join(", ")}…`,
      source: "src/commands/",
    })
  }

  if (ctx.availableAgents.length > 0) {
    items.push({
      answersQuestion: "what-agents-available",
      summary: `${ctx.availableAgents.length} agents available: ${ctx.availableAgents.slice(0, 5).join(", ")}…`,
      source: "src/agents/",
    })
  }

  if (ctx.availableSkills.length > 0) {
    items.push({
      answersQuestion: "what-skills-available",
      summary: `${ctx.availableSkills.length} skills available.`,
      source: "src/skills/",
    })
  }

  if (ctx.implementationPatterns.length > 0) {
    items.push({
      answersQuestion: "what-patterns-exist",
      summary: `Patterns found: ${ctx.implementationPatterns.join(", ")}.`,
      source: "src/",
    })
  }

  if (ctx.hasPriorDiscussions) {
    items.push({
      answersQuestion: "has-prior-decisions",
      summary: "Prior DISCUSS.md files exist — previous decisions are available.",
      source: ".planning/phases/",
    })
  }

  if (ctx.governanceEnabled) {
    items.push({
      answersQuestion: "has-governance",
      summary: "Governance layer is enabled in flowdeck.json.",
      source: "flowdeck.json",
    })
  }

  const srcDir = path.join(ctx.dir, "src")
  if (dirExists(path.join(srcDir, "components")) || dirExists(path.join(ctx.dir, "components"))) {
    items.push({
      answersQuestion: "is-ui-heavy",
      summary: "UI components directory found — project has frontend/UI code.",
      source: "components/",
    })
  }

  if (detectHasTests(ctx.dir)) {
    items.push({
      answersQuestion: "has-existing-tests",
      summary: "Test files (.test.ts / .spec.ts) found in the project.",
      source: "src/**/*.test.ts",
    })
  }

  if (dirExists(path.join(ctx.dir, "docs")) || fileExists(path.join(ctx.dir, "README.md"))) {
    items.push({
      answersQuestion: "has-existing-docs",
      summary: "Documentation exists (docs/ or README.md).",
      source: "docs/ or README.md",
    })
  }

  if (
    fileExists(path.join(ctx.dir, ".github", "workflows")) ||
    fileExists(path.join(ctx.dir, ".gitlab-ci.yml"))
  ) {
    items.push({
      answersQuestion: "has-ci-cd",
      summary: "CI/CD configuration found.",
      source: ".github/workflows/ or .gitlab-ci.yml",
    })
  }

  return items
}

function classifyQuestionKind(questionLower: string): EvidenceQuestionKind | null {
  for (const { kind, patterns } of QUESTION_KIND_PATTERNS) {
    if (patterns.some(p => questionLower.includes(p))) return kind
  }
  return null
}
