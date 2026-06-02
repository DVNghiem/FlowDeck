/**
 * Quick Router Service
 *
 * Provides task classification and stage-sequence routing for the /fd-quick
 * autonomous workflow launcher.
 *
 * This module is the single source of truth for:
 *   - Classifying user task descriptions into task types
 *   - Mapping task types to the correct existing stage sequence
 *   - Computing the next stage given what has already completed
 *   - Determining whether supervisor clarification is required before proceeding
 *
 * It does NOT create new workflows. It routes to the existing commands:
 *   fd-discuss, fd-design, fd-plan, fd-execute, fd-fix-bug, fd-write-docs, fd-verify
 *
 * Autonomy contract:
 *   - classifyTaskWithContext() must be preferred over classifyTask() when a
 *     preflight ExplorationResult is available.
 *   - classificationNeeded is set to false whenever exploration evidence
 *     supplies the missing context, eliminating the human question entirely.
 */

import type { ExplorationResult } from "./preflight-explorer"
import { refineClassification } from "./preflight-explorer"

import {
  buildAdaptiveStageSequence,
  scoreTaskForRouting,
  type RoutingCriteria,
  type WorkflowClass,
} from "./workflow-router"
import { classifyTaskComplexity } from "./model-router"

export type TaskType =
  | "feature"       // Standard new feature — discuss → plan → execute → verify
  | "ui-feature"    // UI-heavy feature — discuss → design → plan → execute → verify
  | "bugfix"        // Bug fix — discuss → fix-bug → verify
  | "docs"          // Documentation task — discuss → write-docs → verify
  | "simple"        // Focused single-scope change — execute directly
  | "ambiguous"     // Not enough signal to classify confidently

/** A single stage in a workflow sequence, mapping to an existing fd-* command. */
export interface WorkflowStage {
  /** Human-readable stage name */
  name: string
  /** The registered fd-* command that implements this stage */
  command: string
  /** Arguments to pass to the command (if any) */
  args?: string
  /** Whether this stage requires human approval before proceeding */
  requiresApproval: boolean
  /** Whether this stage can be skipped if prerequisites are absent and --override is set */
  skippable: boolean
}

export interface ClassificationResult {
  taskType: TaskType
  /** 0.0–1.0 confidence in the classification */
  confidence: number
  /** Which signal patterns triggered the classification */
  signals: string[]
  /** True when the task is explicitly UI/UX-heavy, requiring design-first */
  requiresDesign: boolean
  /** True when TDD enforcement applies (always true except for docs-only) */
  requiresTDD: boolean
  /** Ordered sequence of stages to execute */
  stageSequence: WorkflowStage[]
  /** Adaptive workflow class when routed through buildAdaptiveWorkflow() */
  workflowClass?: WorkflowClass
  /** Routing scores from the adaptive router */
  scores?: import("./workflow-router").RoutingScore
  /** True when the description is too vague to classify without asking a question */
  clarificationNeeded: boolean
  /** The single clarifying question to ask via supervisor (when clarificationNeeded=true) */
  clarificationPrompt?: string
}

const BUG_SIGNALS = [
  "fix", "bug", "broken", "not working", "doesn't work", "does not work",
  "error", "crash", "regression", "debug", "exception", "failing", "fails",
  "incorrect", "wrong output", "infinite loop", "null pointer", "undefined",
  "404", "500", "stack trace", "traceback", "root cause", "why is",
]

const UI_SIGNALS = [
  "landing page", "dashboard", "admin panel", "admin page", "app screen",
  "onboarding", "onboard", "wireframe", "mockup", "design system",
  "component library", "ui component", "ux flow", "user interface",
  "web app", "web application", "website", "frontend page", "mobile screen",
  "login page", "signup page", "settings page", "profile page",
  "modal", "dialog", "sidebar", "navigation", "navbar", "header", "footer",
  "layout", "responsive", "accessibility", "a11y", "dark mode", "theme",
]

const DOCS_SIGNALS = [
  "docs", "documentation", "readme", "api docs", "usage guide",
  "write docs", "document", "document the", "how to use", "tutorial",
  "changelog", "contributing guide", "docstring", "jsdoc", "tsdoc",
]

const SIMPLE_SIGNALS = [
  "rename", "move file", "quick", "minor", "small change", "one-liner",
  "typo", "update constant", "update config", "bump version",
]

const AMBIGUOUS_PATTERNS = [
  /^(improve|make|update|change|add|remove|help|do|run|check|use)\s+\w+$/i,
]

/**
 * Classify a free-text task description into a TaskType with a confidence score.
 *
 * Signal matching is case-insensitive substring search. Multiple signal hits
 * increase confidence. The highest-confidence match wins; ties break toward
 * the more structured workflow type (feature > simple > ambiguous).
 */
export function classifyTask(description: string): ClassificationResult {
  const lower = description.toLowerCase().trim()

  if (!lower) {
    return _ambiguous([], "What task do you want to run? Please describe what you need done.")
  }

  const bugHits = BUG_SIGNALS.filter(s => lower.includes(s))
  const uiHits = UI_SIGNALS.filter(s => lower.includes(s))
  const docsHits = DOCS_SIGNALS.filter(s => lower.includes(s))
  const simpleHits = SIMPLE_SIGNALS.filter(s => lower.includes(s))

  // Score each type (0–1 scale based on signal count and weight)
  const bugScore = Math.min(bugHits.length * 0.35, 1.0)
  const uiScore = Math.min(uiHits.length * 0.30, 1.0)
  const docsScore = Math.min(docsHits.length * 0.40, 1.0)
  const simpleScore = Math.min(simpleHits.length * 0.45, 1.0)

  // Bug fix wins when it has highest score and score >= threshold
  if (bugScore >= 0.35 && bugScore >= uiScore && bugScore >= docsScore) {
    return {
      taskType: "bugfix",
      confidence: Math.min(0.5 + bugScore * 0.5, 0.98),
      signals: bugHits,
      requiresDesign: false,
      requiresTDD: true,
      stageSequence: buildStageSequence("bugfix"),
      clarificationNeeded: bugScore < 0.5,
      clarificationPrompt: bugScore < 0.5
        ? "Can you describe the specific bug? What is the expected vs actual behavior?"
        : undefined,
    }
  }

  // UI-heavy feature detection (must have >= 1 strong UI signal)
  if (uiScore >= 0.30) {
    return {
      taskType: "ui-feature",
      confidence: Math.min(0.5 + uiScore * 0.45, 0.95),
      signals: uiHits,
      requiresDesign: true,
      requiresTDD: true,
      stageSequence: buildStageSequence("ui-feature"),
      clarificationNeeded: false,
    }
  }

  // Docs-only
  if (docsScore >= 0.40 && docsScore >= bugScore) {
    return {
      taskType: "docs",
      confidence: Math.min(0.55 + docsScore * 0.40, 0.95),
      signals: docsHits,
      requiresDesign: false,
      requiresTDD: false,
      stageSequence: buildStageSequence("docs"),
      clarificationNeeded: false,
    }
  }

  // Simple focused change
  if (simpleScore >= 0.45) {
    return {
      taskType: "simple",
      confidence: Math.min(0.55 + simpleScore * 0.35, 0.90),
      signals: simpleHits,
      requiresDesign: false,
      requiresTDD: false,
      stageSequence: buildStageSequence("simple"),
      clarificationNeeded: false,
    }
  }

  // Generic feature — description is substantive but no specific signals
  const wordCount = lower.split(/\s+/).filter(Boolean).length
  if (wordCount >= 5) {
    return {
      taskType: "feature",
      confidence: Math.min(0.50 + wordCount * 0.02, 0.85),
      signals: [],
      requiresDesign: false,
      requiresTDD: true,
      stageSequence: buildStageSequence("feature"),
      clarificationNeeded: wordCount < 8,
      clarificationPrompt: wordCount < 8
        ? "Is this a new feature, a bug fix, or a documentation task? A bit more context will help route it correctly."
        : undefined,
    }
  }

  // Ambiguous patterns
  const isAmbiguousPattern = AMBIGUOUS_PATTERNS.some(p => p.test(lower))
  if (isAmbiguousPattern || wordCount < 5) {
    return _ambiguous(
      [],
      "Can you describe the task in more detail? For example: is it a new feature, a bug fix, a UI change, or documentation?",
    )
  }

  // Default: treat as feature
  return {
    taskType: "feature",
    confidence: 0.60,
    signals: [],
    requiresDesign: false,
    requiresTDD: true,
    stageSequence: buildStageSequence("feature"),
    clarificationNeeded: false,
  }
}

function _ambiguous(signals: string[], prompt: string): ClassificationResult {
  return {
    taskType: "ambiguous",
    confidence: 0.0,
    signals,
    requiresDesign: false,
    requiresTDD: false,
    stageSequence: [],
    clarificationNeeded: true,
    clarificationPrompt: prompt,
  }
}

/**
 * Build the ordered WorkflowStage array for a given TaskType.
 * Each stage maps 1:1 to an existing registered fd-* command.
 *
 * @deprecated Use buildAdaptiveWorkflow() instead for adaptive routing.
 * Kept for backward compatibility.
 */
export function buildStageSequence(taskType: TaskType): WorkflowStage[] {
  switch (taskType) {
    case "feature":
      return [
        stage("discuss",  "fd-discuss",    false, false),
        stage("plan",     "fd-plan",       true,  false),
        stage("execute",  "fd-execute",    false, false),
        stage("verify",   "fd-verify",     false, false),
      ]

    case "ui-feature":
      return [
        stage("discuss",  "fd-discuss",           false, false),
        stage("design",   "fd-design", false, false, "--mode=draft"),
        stage("plan",     "fd-plan",               true,  false),
        stage("execute",  "fd-execute",            false, false),
        stage("verify",   "fd-verify",             false, false),
      ]

    case "bugfix":
      return [
        stage("discuss",  "fd-discuss",   false, false),
        stage("fix-bug",  "fd-fix-bug",   false, false),
        stage("verify",   "fd-verify",    false, false),
      ]

    case "docs":
      return [
        stage("discuss",    "fd-discuss",    false, false),
        stage("write-docs", "fd-write-docs", false, false),
        stage("verify",     "fd-verify",     false, true),
      ]

    case "simple":
      return [
        stage("execute", "fd-execute", false, false),
        stage("verify",  "fd-verify",  false, true),
      ]

    case "ambiguous":
      return [] // no sequence until classified

    default:
      return []
  }
}

/**
 * Build an adaptive workflow for a task description using the new
 * workflow router. Uses exploration context when available.
 */
export function buildAdaptiveWorkflow(
  description: string,
  exploration?: import("./preflight-explorer").ExplorationResult,
): ClassificationResult {
  // 1. Get base classification
  const base = exploration
    ? classifyTaskWithContext(description, exploration)
    : classifyTask(description)

  // 2. Determine complexity
  const complexityResult = classifyTaskComplexity(description)

  // 3. Build routing criteria
  const criteria: RoutingCriteria = {
    taskType: base.taskType,
    complexity: complexityResult.complexity,
    confidence: base.confidence,
    blastRadius: 0, // Will be updated after exploration
    isSensitive: false, // Will be updated after exploration
    codebaseFreshness: exploration ? "fresh" : "unknown",
    requiresTests: base.requiresTDD,
  }

  // 4. Get adaptive route
  const route = buildAdaptiveStageSequence(criteria)

  // 5. Return enhanced classification
  return {
    ...base,
    stageSequence: route.stages,
    workflowClass: route.workflowClass,
    scores: route.scores,
  }
}

function stage(
  name: string,
  command: string,
  requiresApproval: boolean,
  skippable: boolean,
  args?: string,
): WorkflowStage {
  return { name, command, args, requiresApproval, skippable }
}

export interface StageProgress {
  completedStageNames: string[]
  blockedAtStage?: string
  blockedReason?: string
}

export interface NextStageResult {
  /** The stage to execute next, or null if all stages are complete */
  stage: WorkflowStage | null
  /** True when all stages have been completed */
  allComplete: boolean
  /** True when execution is blocked at a stage */
  blocked: boolean
  blockedReason?: string
  /** Remaining stage names (not counting the returned stage) */
  remaining: string[]
}

/**
 * Given a stage sequence and the current progress, determine the next
 * stage to execute.
 *
 * Returns null stage when all stages are complete.
 */
export function getNextStage(
  sequence: WorkflowStage[],
  progress: StageProgress,
): NextStageResult {
  if (sequence.length === 0) {
    return { stage: null, allComplete: true, blocked: false, remaining: [] }
  }

  if (progress.blockedAtStage) {
    const blockedStage = sequence.find(s => s.name === progress.blockedAtStage)
    return {
      stage: blockedStage ?? null,
      allComplete: false,
      blocked: true,
      blockedReason: progress.blockedReason,
      remaining: sequence
        .slice(sequence.findIndex(s => s.name === progress.blockedAtStage) + 1)
        .map(s => s.name),
    }
  }

  const completedSet = new Set(progress.completedStageNames)
  const nextStage = sequence.find(s => !completedSet.has(s.name))

  if (!nextStage) {
    return { stage: null, allComplete: true, blocked: false, remaining: [] }
  }

  const nextIndex = sequence.indexOf(nextStage)
  const remaining = sequence.slice(nextIndex + 1).map(s => s.name)

  return {
    stage: nextStage,
    allComplete: false,
    blocked: false,
    remaining,
  }
}

/** The structure written to STATE.md under the `quick_run` key by /fd-quick. */
export interface QuickRunState {
  /** Original task description from $ARGUMENTS */
  taskDescription: string
  /** Classification result */
  taskType: TaskType
  confidence: number
  requiresDesign: boolean
  requiresTDD: boolean
  /** Ordered stage names for this run */
  stageSequence: string[]
  /** Stages that have been completed */
  completedStages: string[]
  /** Current stage being executed, if any */
  currentStage: string | null
  /** Whether the run has been halted */
  blocked: boolean
  blockedReason?: string
  /** Supervisor decisions keyed by stage name */
  supervisorDecisions: Record<string, { decision: string; reasons: string[]; timestamp: string }>
  /** ISO timestamp when the run started */
  startedAt: string
  /** ISO timestamp of last update */
  updatedAt: string
  /** Final run outcome */
  outcome: "running" | "complete" | "blocked" | "failed"
  /**
   * Preflight exploration snapshot — persisted so later stages can
   * reuse it without re-running exploration or re-asking the user.
   */
  preflightExploration?: {
    exploredAt: string
    techStack: string[]
    availableCommands: string[]
    availableSkills: string[]
    implementationPatterns: string[]
    evidenceCount: number
    /** Whether clarification was resolved via evidence (no human asked) */
    clarificationResolvedByEvidence: boolean
    /** The resolved reason when evidence answered the question */
    clarificationResolvedReason?: string
  }
  /** Questions that were suppressed by the guard (not sent to human) */
  suppressedQuestions: string[]
  /** Adaptive workflow class from the router */
  workflowClass?: string
  /** Routing scores from the adaptive router */
  routingScores?: {
    simplicity: number
    confidence: number
    lowRisk: number
    knownCodebase: number
    cheapComplexity: number
    total: number
  }
}

/**
 * Create a fresh QuickRunState record for a new /fd-quick run.
 */
export function createQuickRunState(
  taskDescription: string,
  classification: ClassificationResult,
  exploration?: ExplorationResult,
): QuickRunState {
  const now = new Date().toISOString()

  const preflightExploration = exploration
    ? {
        exploredAt: exploration.exploredAt,
        techStack: exploration.techStack,
        availableCommands: exploration.availableCommands,
        availableSkills: exploration.availableSkills,
        implementationPatterns: exploration.implementationPatterns,
        evidenceCount: exploration.evidenceItems.length,
        clarificationResolvedByEvidence: false,
        clarificationResolvedReason: undefined,
      }
    : undefined

  return {
    taskDescription,
    taskType: classification.taskType,
    confidence: classification.confidence,
    requiresDesign: classification.requiresDesign,
    requiresTDD: classification.requiresTDD,
    stageSequence: classification.stageSequence.map(s => s.name),
    completedStages: [],
    currentStage: classification.stageSequence[0]?.name ?? null,
    blocked: false,
    supervisorDecisions: {},
    startedAt: now,
    updatedAt: now,
    outcome: "running",
    preflightExploration,
    suppressedQuestions: [],
    workflowClass: classification.workflowClass ?? undefined,
    routingScores: classification.scores ?? undefined,
  }
}

/**
 * Classify a task description, using repo exploration evidence to resolve
 * ambiguity before falling back to supervisor clarification.
 *
 * Prefer this over `classifyTask` whenever a preflight ExplorationResult is
 * available. It eliminates unnecessary human questions when the repo already
 * contains the answer.
 *
 * @param description  - Free-text task from the user
 * @param exploration  - ExplorationResult from exploreRepo()
 * @param sessionHistory - Questions already asked in this session (for
 *                         deduplication via the question guard)
 */
export function classifyTaskWithContext(
  description: string,
  exploration: ExplorationResult,
  sessionHistory: string[] = [],
): ClassificationResult {
  // Step 1: Run the base text-only classification
  const base = classifyTask(description)

  // Step 2: If classification is confident, return it directly
  if (!base.clarificationNeeded) {
    return base
  }

  // Step 3: Try to resolve the ambiguity with exploration evidence
  const refinement = refineClassification(
    base.clarificationPrompt ?? "",
    exploration,
    sessionHistory,
  )

  if (!refinement.clarificationStillNeeded) {
    // Evidence answered the question — route as `feature` (best safe default)
    // and clear the clarification requirement
    const resolvedType: TaskType = base.taskType === "ambiguous" ? "feature" : base.taskType
    return {
      ...base,
      taskType: resolvedType,
      stageSequence: buildStageSequence(resolvedType),
      clarificationNeeded: false,
      clarificationPrompt: undefined,
      confidence: Math.max(base.confidence, 0.55),
    }
  }

  // Step 4: Clarification still needed — enrich the prompt with repo context
  const enrichedPrompt = refinement.supervisorContext
    ? `${base.clarificationPrompt ?? ""} (Context: ${refinement.supervisorContext})`
    : base.clarificationPrompt

  return {
    ...base,
    clarificationPrompt: enrichedPrompt,
  }
}
