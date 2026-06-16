/**
 * Context Ingress Service
 *
 * Assembles the runtime context for a command execution:
 *  - planning state (STATE.md)
 *  - plan content (PLAN.md) — resolved through canonical path helper
 *  - .codebase/ documentation (capped)
 *  - recent tool/session events (capped)
 *  - task complexity classification (via quick-router + workflow-router)
 *  - relevant rules and skills (capped)
 *  - token budget snapshot
 *  - readiness diagnostics for codegraph / codebase index / state
 *  - selected tool family via tool-selection-policy
 *
 * Staged loading: route + readiness are computed first, the load plan is
 * then derived, and only then are heavy artifacts read. This prevents the
 * "greedy load" pattern where trivial chat prompts still trigger the full
 * docs/events/rules fan-out.
 *
 * The service is advisory: it does not block execution and does not mutate
 * external state except through explicit dependencies injected by the caller.
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, basename } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

import type { FlowDeckConfig } from "../config/schema"
import { readPlanningState, type PlanningState, resolveActivePlanPath } from "../tools/planning-state-lib"
import { classifyTaskComplexity } from "./model-router"
import { detectProjectLanguages, selectRulePaths } from "./lazy-rule-loader"
import type { ToolEvent } from "./event-logger"
import {
  type AssembledContext,
  type ContextLoadDiagnostics,
  type ContextLoadPlan,
  type ContextReadiness,
  type Observation,
  type TokenBudgetSnapshot,
  type WorkflowRoute,
} from "./harness-types"
import { classifyTask } from "./quick-router"
import {
  buildAdaptiveStageSequence,
  computeRoutingHeuristics,
  type RoutingCriteria,
  type WorkflowRoute as RouterWorkflowRoute,
} from "./workflow-router"
import { isCodegraphFresh, isCodegraphIndexed, isCodegraphInstalled, readCodegraphMeta } from "./codegraph"
import {
  selectToolFamily,
  shouldActivateTokenOptimization,
  type ToolFamily,
} from "./tool-selection-policy"
import type { McpAvailability } from "../mcp/index"

export interface TrivialChatResult {
  isTrivialChat: boolean
  confidence: number
  reason: string
}

export interface ContextIngressInput {
  runId: string
  sessionId: string
  projectRoot: string
  description: string
  config?: FlowDeckConfig
  /** Optional MCP availability metadata. When omitted, the policy still works
   *  (it just sees an empty availability list and falls back to default). */
  mcpAvailability?: McpAvailability[]
}

export interface ContextIngressOptions {
  maxEvents?: number
  eventMaxAgeMinutes?: number
  planTruncateThreshold?: number
  planTruncateTo?: number
  totalTokenBudget?: number
  /** Per-stage caps. Defaults are tuned for the typical /fd-quick run. */
  maxDocs?: number
  maxRules?: number
  maxSkills?: number
  /** Token size above which token-optimizer should be preferred. */
  tokenOptimizationThreshold?: number
  /** Force-disable the heuristic router (e.g. in tests). */
  disableAdaptiveRouting?: boolean
}

const DEFAULT_OPTIONS: Required<ContextIngressOptions> = {
  maxEvents: 10,
  eventMaxAgeMinutes: 30,
  planTruncateThreshold: 8000,
  planTruncateTo: 4000,
  totalTokenBudget: 100_000,
  maxDocs: 5,
  maxRules: 6,
  maxSkills: 5,
  tokenOptimizationThreshold: 20_000,
  disableAdaptiveRouting: false,
}

const GREETING_PATTERNS = [
  /^hi\b/i,
  /^hello\b/i,
  /^hey\b/i,
  /^good\s+(morning|afternoon|evening)\b/i,
  /^thanks?\b/i,
  /^ok\b/i,
  /^okay\b/i,
]

const TRIVIAL_QUESTION_PATTERNS = [
  /\bwhat\s+is\b/i,
  /\bhow\s+(do|can|should|would|does)\s+i\b/i,
  /\bexplain\b/i,
  /\bsummarize\b/i,
  /\bcheck\s+if\b/i,
  /\bwhat\s+(are|does|did|can|should)\b/i,
  /\bcan\s+you\s+(explain|tell|show|help)\b/i,
]

const IMPLEMENTATION_VERBS = [
  "add",
  "build",
  "refactor",
  "fix",
  "write",
  "implement",
  "migrate",
  "create",
  "update",
  "delete",
  "remove",
  "introduce",
  "configure",
  "deploy",
  "test",
]

const MULTI_STEP_WORDS = [
  "then",
  "next",
  "after",
  "before",
  "first",
  "second",
  "finally",
  "step",
  "phase",
]

const SENSITIVE_PATH_PATTERNS = [
  /auth/i,
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /security/i,
  /permission/i,
  /oauth/i,
  /session/i,
  /private[_-]?key/i,
  /\.env\b/i,
  /payment/i,
  /billing/i,
]

const TOKEN_SENSITIVE_PATTERNS = [
  /large\s+file/i,
  /big\s+plan/i,
  /many\s+docs/i,
  /huge\s+/i,
  /entire\s+(file|module|repo|codebase)/i,
  /full\s+log/i,
  /read\s+all/i,
  /token\s+(sensitive|budget|limit)/i,
]

/**
 * Patterns that flag a task as an open-ended web research request. The
 * detection is intentionally narrow — phrasing has to be clearly about
 * external research, not just mention a word in passing. The runtime
 * defaults to `general` for ambiguous inputs and only escalates to
 * `web_research` when at least one of these patterns matches.
 */
const WEB_RESEARCH_PATTERNS = [
  /\bweb\s+(search|research|lookup|query)\b/i,
  /\bsearch\s+(the\s+)?(web|internet|online)\b/i,
  /\blook\s*up\s+(on|on\s+the)?\s*(web|internet|google|duckduckgo|bing)\b/i,
  /\bgoogle\s+(it|this|that)\b/i,
  /\bfind\s+(the\s+)?(latest|current|recent|news|blog|article|tutorial|guide)\b/i,
  /\bopen[-\s]?ended\s+(research|search)\b/i,
  /\bbrowse\s+(the\s+)?(web|site|url)\b/i,
  /\bcurrent\s+(news|state|status|developments|trends)\b/i,
  /\bwhat('s| is)\s+happening\s+(with|in)\b/i,
  /\blatest\s+(news|version|release|update|standards?)\b/i,
  /\btrending\s+(repos?|packages?|libs?)\b/i,
]

/**
 * Patterns that flag a task as a specific library/framework API lookup.
 * These should always be served by context7 (or grep_app / websearch
 * fallback) instead of the default codegraph/local-read path.
 */
const LIBRARY_DOCS_PATTERNS = [
  /\b(library|framework|api|sdk)\s+(docs?|documentation|reference)\b/i,
  /\b(how\s+to\s+use|usage\s+of|usage\s+for|api\s+for|api\s+of)\s+[A-Z][\w./-]*/i,
  /\breference\s+(for|docs?\s+for)\b/i,
  /\bcontext\s*7\b/i,
  /\b(?:signatures?|function\s+signature|method\s+signature)\s+(for|of)\b/i,
  /\b(?:read|fetch|get|look\s*up)\s+the\s+(docs?|documentation)\b/i,
  /\b(?:npm|pypi|cargo|maven)\s+(package|library)\b/i,
  /\bdocs?\s+for\s+[A-Z][\w./-]*/i,
  /\b(?:react|vue|angular|svelte|next|nuxt|express|fastapi|django|flask|gin|spring|laravel|rails|nestjs|astro|remix)\s+(hooks?|api|routing|components?)\b/i,
]

export function isTrivialChat(description: string): TrivialChatResult {
  const trimmed = description.trim()
  if (trimmed.length === 0) {
    return { isTrivialChat: true, confidence: 1, reason: "empty input" }
  }

  const wordCount = trimmed.split(/\s+/).length

  // Greetings are trivial
  if (GREETING_PATTERNS.some(p => p.test(trimmed))) {
    return { isTrivialChat: true, confidence: 0.95, reason: "greeting or social opener" }
  }

  const hasFilePath = /\/[\w\-_.]+/.test(trimmed) || /\.[a-z]{2,6}\b/i.test(trimmed)
  const hasImplementationVerb = IMPLEMENTATION_VERBS.some(v =>
    new RegExp(`\\b${v}\\b`, "i").test(trimmed),
  )
  const hasMultiStepLanguage = MULTI_STEP_WORDS.some(w =>
    new RegExp(`\\b${w}\\b`, "i").test(trimmed),
  )
  const hasQuestionPattern = TRIVIAL_QUESTION_PATTERNS.some(p => p.test(trimmed))

  // Strong signal of real work
  if (hasFilePath || hasImplementationVerb || hasMultiStepLanguage) {
    const reasons: string[] = []
    if (hasFilePath) reasons.push("file path")
    if (hasImplementationVerb) reasons.push("implementation verb")
    if (hasMultiStepLanguage) reasons.push("multi-step language")
    return {
      isTrivialChat: false,
      confidence: 0.9,
      reason: `task description contains ${reasons.join(", ")}`,
    }
  }

  // Short questions are trivial
  if (wordCount <= 8 && hasQuestionPattern) {
    return {
      isTrivialChat: true,
      confidence: 0.85,
      reason: "short question matching a trivial pattern",
    }
  }

  // Very short inputs without implementation signals are trivial
  if (wordCount <= 8) {
    return {
      isTrivialChat: true,
      confidence: 0.75,
      reason: "short input without implementation signals",
    }
  }

  // Default: treat longer, non-implementation text as non-trivial (could be analysis)
  return {
    isTrivialChat: false,
    confidence: 0.6,
    reason: "no strong trivial or implementation signals",
  }
}

/** Detect whether the description touches a sensitive path. */
export function isSensitiveDescription(description: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some(p => p.test(description))
}

/** Detect whether the description implies a token-sensitive reading context. */
export function isTokenSensitiveDescription(description: string): boolean {
  return TOKEN_SENSITIVE_PATTERNS.some(p => p.test(description))
}

/**
 * Detect whether the description is an open-ended web research request.
 * Exported for tests and reuse.
 */
export function isWebResearchDescription(description: string): boolean {
  return WEB_RESEARCH_PATTERNS.some(p => p.test(description))
}

/**
 * Detect whether the description is a specific library/framework API
 * lookup. Exported for tests and reuse.
 */
export function isLibraryDocsDescription(description: string): boolean {
  return LIBRARY_DOCS_PATTERNS.some(p => p.test(description))
}

function inferBlastRadius(description: string): number {
  const lower = description.toLowerCase()
  let radius = 0
  if (/\bmulti[- ]?file\b/i.test(lower)) radius = Math.max(radius, 4)
  if (/\bmulti[- ]?module\b/i.test(lower)) radius = Math.max(radius, 4)
  if (/\bmulti[- ]?service\b/i.test(lower)) radius = Math.max(radius, 5)
  if (/\b(refactor|migration|cross[- ]?cutting)\b/i.test(lower)) radius = Math.max(radius, 4)
  if (/\bsystem\s+design\b/i.test(lower)) radius = Math.max(radius, 5)
  if (/\b(small|minor|rename|typo)\b/i.test(lower)) radius = Math.max(radius, 1)
  // File path mentions: count distinct paths
  const paths = lower.match(/[\w\-/.]+\.[a-z]{1,6}\b/g) ?? []
  radius = Math.max(radius, Math.min(paths.length, 6))
  return radius
}

export class ContextIngressService {
  private options: Required<ContextIngressOptions>

  constructor(options: ContextIngressOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  assemble(input: ContextIngressInput): AssembledContext {
    const trivial = isTrivialChat(input.description)
    const availability = input.mcpAvailability ?? []

    // Stage 1: Read state (cheap) — also determines plan resolution
    const state = readPlanningState(input.projectRoot)
    const planResolved = resolveActivePlanPath(input.projectRoot, state)

    // Stage 2: Compute readiness signals (cheap) — used to decide if we
    // need to load expensive context AND to log a diagnostic when mapping
    // is missing or stale.
    const readiness = this.computeReadiness(input.projectRoot, state)

    // Stage 3: Compute route (uses quick-router + workflow-router) BEFORE
    // loading heavy context, so the load plan can react to the route.
    const route = this.buildRoute(input.description, state)
    const heuristics = computeRoutingHeuristics(this.routeToCriteria(route, input.description, state))

    // Stage 4: Derive the load plan. Trivial chat → heavy context off.
    const loadPlan = this.buildLoadPlan(trivial.isTrivialChat, heuristics, route)
    const fallbackReasons: string[] = []

    // Stage 5: Conditionally load heavy context. Each loader reports what
    // it kept and what it skipped so the diagnostics stay honest.
    const planContent = loadPlan.loadPlan
      ? this.readPlanContent(input.projectRoot, planResolved?.path)
      : ""
    if (loadPlan.loadPlan && !planResolved) {
      fallbackReasons.push("plan_resolution: no plan file under .planning/phases/phase-<n>/ or legacy .planning/")
    }

    const { loaded: loadedDocs, skipped: skippedDocs } = trivial.isTrivialChat
      ? { loaded: {}, skipped: [] as string[] }
      : this.readCodebaseDocs(input.projectRoot, loadPlan.maxDocs)
    if (Object.keys(skippedDocs).length > 0) {
      fallbackReasons.push(`docs: skipped ${skippedDocs.length} (cap=${loadPlan.maxDocs})`)
    }

    const { events: recentEvents, dropped: droppedEvents } = trivial.isTrivialChat
      ? { events: [] as ToolEvent[], dropped: 0 }
      : this.readRecentEvents(input.projectRoot, loadPlan.maxEvents)
    if (droppedEvents > 0) {
      fallbackReasons.push(`events: dropped ${droppedEvents} (maxAge=${this.options.eventMaxAgeMinutes}m, cap=${loadPlan.maxEvents})`)
    }

    const relevantRules = trivial.isTrivialChat
      ? []
      : this.selectRelevantRules(input.projectRoot, input.description, state, route, loadPlan.maxRules)
    if (!trivial.isTrivialChat && relevantRules.length === 0) {
      fallbackReasons.push("rules: no rule files selected for this stage/language")
    }

    const relevantSkills = trivial.isTrivialChat
      ? []
      : this.selectRelevantSkills(input.description, loadPlan.maxSkills)

    const observations: Observation[] = []

    // Stage 6: Budget before/after. Before excludes observations to give
    // a stable signal of "context payload" the consumer will see.
    const beforeSnapshot = this.computeTokenBudget({
      state,
      planContent,
      codebaseDocs: loadedDocs,
      recentEvents,
      relevantRules,
      relevantSkills,
    })
    const tokenBudget = beforeSnapshot
    if (!trivial.isTrivialChat && beforeSnapshot.percentUsed >= 90) {
      fallbackReasons.push(`budget: ${beforeSnapshot.percentUsed}% used — consider pruning or activating token-optimizer`)
    }

    // Stage 7: Select the preferred tool family. The policy is also run for
    // trivial chat (where it returns default) so logs are consistent.
    const toolSelection = this.selectToolFamilyForIntent(input.description, heuristics, route, availability, input.projectRoot)
    const tokenOptFamily = shouldActivateTokenOptimization(
      beforeSnapshot.usedTokens,
      this.options.tokenOptimizationThreshold,
      availability,
    )
    const tokenOptimizationActive = tokenOptFamily !== null
    if (tokenOptimizationActive && !toolSelection.primary.preferred) {
      fallbackReasons.push(`token_optimization: active (${beforeSnapshot.usedTokens} tokens >= ${this.options.tokenOptimizationThreshold})`)
    }

    // Merge heuristics into route for downstream consumers. The harness-types
    // WorkflowRoute uses Record<string, unknown> for criteria; the router's
    // Route uses a stricter shape, so we widen at the boundary.
    const enrichedRoute: WorkflowRoute = {
      workflowClass: route.workflowClass,
      stages: route.stages,
      criteria: route.criteria as unknown as Record<string, unknown>,
      scores: route.scores as unknown as Record<string, number>,
      reason: route.reason,
      requiresDiscuss: heuristics.requiresDiscuss,
      ...(heuristics.skipDiscussReason !== undefined ? { skipDiscussReason: heuristics.skipDiscussReason } : {}),
      needsCodeUnderstanding: heuristics.needsCodeUnderstanding,
      classificationSignals: heuristics.classificationSignals,
    }

    const diagnostics: ContextLoadDiagnostics = {
      loadedDocs: Object.keys(loadedDocs),
      skippedDocs: Object.keys(skippedDocs),
      loadedEvents: recentEvents.length,
      droppedEvents,
      loadedRules: relevantRules,
      loadedSkills: relevantSkills,
      budgetBefore: beforeSnapshot,
      budgetAfter: tokenBudget,
      fallbackReasons,
    }

    return {
      runId: input.runId,
      sessionId: input.sessionId,
      projectRoot: input.projectRoot,
      state: state as unknown as Record<string, unknown>,
      route: enrichedRoute,
      relevantRules,
      relevantSkills,
      recentEvents,
      observations,
      tokenBudget,
      isTrivialChat: trivial.isTrivialChat,
      readiness,
      loadPlan,
      diagnostics,
      selectedToolFamily: {
        family: toolSelection.primary.family,
        mcp: toolSelection.primary.mcp,
        reason: toolSelection.primary.reason,
        preferred: toolSelection.primary.preferred,
        fallbacks: toolSelection.fallbacks.map(f => f.family),
      },
      tokenOptimizationActive,
    }
  }

  // ─── Readiness ───────────────────────────────────────────────────────────

  private computeReadiness(projectRoot: string, state: PlanningState): ContextReadiness {
    const fallbacks: string[] = []
    const statePresent = state.lastUpdatedAt !== "" || state.phase > 0
    const stateFresh = state.freshnessStatus === "fresh" && statePresent
    if (!statePresent) fallbacks.push("state: STATE.md missing")
    else if (!stateFresh) fallbacks.push(`state: freshnessStatus=${state.freshnessStatus}`)

    const codebaseIndexPresent = (() => {
      const cbDir = join(projectRoot, ".codebase")
      if (!existsSync(cbDir)) return false
      try {
        return readdirSync(cbDir).some(f => f.endsWith(".md") && f !== "README.md")
      } catch {
        return false
      }
    })()
    if (!codebaseIndexPresent) fallbacks.push("mapping: .codebase/*.md missing or empty")

    const codegraphInstalled = isCodegraphInstalled()
    const codegraphIndexed = isCodegraphIndexed(projectRoot)
    const codegraphFresh = isCodegraphFresh(projectRoot)
    if (!codegraphInstalled) fallbacks.push("codegraph: not installed")
    else if (!codegraphIndexed) {
      // Only surface as a fallback if the intent needs codegraph
      const meta = readCodegraphMeta(projectRoot)
      fallbacks.push(`codegraph: not indexed (${meta.installLog ? "install ok" : "install pending"})`)
    } else if (!codegraphFresh) {
      fallbacks.push("codegraph: index exists but stale (rebuild suggested)")
    }

    return {
      statePresent,
      stateFresh,
      codebaseIndexPresent,
      codegraphInstalled,
      codegraphIndexed,
      codegraphFresh,
      fallbacks,
    }
  }

  // ─── Route ───────────────────────────────────────────────────────────────

  private buildRoute(description: string, state: PlanningState): RouterWorkflowRoute {
    if (this.options.disableAdaptiveRouting) {
      return this.fallbackRoute(description, state)
    }
    const complexityResult = classifyTaskComplexity(description)
    const classification = classifyTask(description)
    const criteria: RoutingCriteria = {
      taskType: classification.taskType,
      complexity: complexityResult.complexity,
      confidence: classification.confidence,
      blastRadius: inferBlastRadius(description),
      isSensitive: isSensitiveDescription(description),
      codebaseFreshness: state.freshnessStatus === "fresh" ? "fresh" : state.freshnessStatus === "stale" ? "stale" : "unknown",
      requiresTests: classification.requiresTDD,
    }
    return buildAdaptiveStageSequence(criteria)
  }

  /**
   * Fallback route used when adaptive routing is disabled or fails.
   * Mirrors the legacy regex-only behaviour but keeps the WorkflowRoute shape.
   */
  private fallbackRoute(description: string, _state: PlanningState): RouterWorkflowRoute {
    const decision = classifyTaskComplexity(description)
    const workflowClass = decision.complexity === "cheap" ? "quick" : decision.complexity === "expensive" ? "verify-heavy" : "standard"
    const stages = workflowClass === "quick" ? ["execute", "verify"] : workflowClass === "verify-heavy" ? ["plan", "execute", "verify"] : decision.complexity === "expensive" ? ["discuss", "plan", "execute", "verify"] : ["plan", "execute", "verify"]
    const criteria: RoutingCriteria = {
      taskType: decision.complexity === "cheap" ? "simple" : "feature",
      complexity: decision.complexity,
      confidence: 0.6,
      blastRadius: 0,
      isSensitive: false,
      codebaseFreshness: "unknown",
      requiresTests: false,
    }
    return {
      workflowClass,
      stages: stages.map(name => ({ name, command: `fd-${name}`, requiresApproval: name === "plan", skippable: name === "verify" })),
      criteria,
      scores: {
        simplicity: decision.complexity === "cheap" ? 0.5 : 0.3,
        confidence: 0.6,
        lowRisk: decision.complexity === "cheap" ? 0.5 : 0.3,
        knownCodebase: 0.5,
        cheapComplexity: decision.complexity === "cheap" ? 1 : 0,
        total: 0,
      },
      reason: decision.reason,
      heuristics: computeRoutingHeuristics({
        taskType: decision.complexity === "cheap" ? "simple" : "feature",
        complexity: decision.complexity,
        confidence: 0.6,
        blastRadius: 0,
        isSensitive: false,
        codebaseFreshness: "unknown",
        requiresTests: false,
      }),
    }
  }

  private routeToCriteria(
    route: RouterWorkflowRoute,
    description: string,
    state: PlanningState,
  ): RoutingCriteria {
    return {
      taskType: (route.criteria.taskType ?? "feature") as RoutingCriteria["taskType"],
      complexity: (route.criteria.complexity ?? "standard") as RoutingCriteria["complexity"],
      confidence: route.scores.confidence / 0.20 || 0.6,
      blastRadius: inferBlastRadius(description),
      isSensitive: isSensitiveDescription(description),
      codebaseFreshness: state.freshnessStatus === "fresh" ? "fresh" : state.freshnessStatus === "stale" ? "stale" : "unknown",
      requiresTests: Boolean(route.criteria.requiresTests),
    }
  }

  // ─── Load plan ───────────────────────────────────────────────────────────

  private buildLoadPlan(
    isTrivial: boolean,
    heuristics: ReturnType<typeof computeRoutingHeuristics>,
    route: RouterWorkflowRoute,
  ): ContextLoadPlan {
    const reasons: string[] = []
    if (isTrivial) reasons.push("trivial chat: skip heavy context")
    if (heuristics.skipDiscussReason) reasons.push(`router: ${heuristics.skipDiscussReason}`)
    if (route.workflowClass === "quick" && !isTrivial) reasons.push("workflow=quick: cap context tightly")
    if (route.workflowClass === "docs-only" && !isTrivial) reasons.push("workflow=docs-only: prefer minimal context")

    const isQuick = route.workflowClass === "quick" || route.workflowClass === "docs-only" || isTrivial
    return {
      loadCodebaseDocs: !isTrivial,
      loadRecentEvents: !isTrivial,
      loadPlan: !isTrivial,
      maxDocs: isQuick ? 2 : this.options.maxDocs,
      maxRules: isQuick ? 2 : this.options.maxRules,
      maxSkills: isQuick ? 3 : this.options.maxSkills,
      maxEvents: isQuick ? 5 : this.options.maxEvents,
      reasons,
    }
  }

  // ─── Loaders ─────────────────────────────────────────────────────────────

  private readPlanContent(projectRoot: string, explicitPath: string | undefined): string {
    const candidates: string[] = []
    if (explicitPath) candidates.push(explicitPath)
    candidates.push(join(projectRoot, ".planning", "PLAN.md"))
    const phaseDir = join(projectRoot, ".planning", "phases")
    if (existsSync(phaseDir)) {
      try {
        for (const entry of readdirSync(phaseDir)) {
          candidates.push(join(phaseDir, entry, "PLAN.md"))
        }
      } catch {
        // ignore
      }
    }
    for (const path of candidates) {
      if (!existsSync(path)) continue
      try {
        let content = readFileSync(path, "utf-8")
        if (content.length > this.options.planTruncateThreshold) {
          content = `${content.slice(0, this.options.planTruncateTo)}\n\n[PLAN.md truncated: ${content.length} chars]`
        }
        return content
      } catch {
        // try next candidate
      }
    }
    return ""
  }

  private readCodebaseDocs(
    projectRoot: string,
    maxDocs: number,
  ): { loaded: Record<string, string>; skipped: Record<string, string> } {
    const loaded: Record<string, string> = {}
    const skipped: Record<string, string> = {}
    const codebaseDir = join(projectRoot, ".codebase")
    if (!existsSync(codebaseDir)) return { loaded, skipped }

    // Deterministic order: by file name. Stable across runs.
    const allFiles: { name: string; size: number }[] = []
    try {
      for (const file of readdirSync(codebaseDir)) {
        if (!file.endsWith(".md") || file === "README.md") continue
        const filePath = join(codebaseDir, file)
        let size = 0
        try {
          size = readFileSync(filePath, "utf-8").length
        } catch {
          // skip unreadable
        }
        allFiles.push({ name: file, size })
      }
    } catch {
      return { loaded, skipped }
    }

    allFiles.sort((a, b) => a.name.localeCompare(b.name))
    for (const f of allFiles) {
      const filePath = join(codebaseDir, f.name)
      try {
        const content = readFileSync(filePath, "utf-8")
        if (Object.keys(loaded).length >= maxDocs) {
          skipped[f.name] = `cap_reached: maxDocs=${maxDocs}`
          continue
        }
        loaded[f.name] = content
      } catch {
        skipped[f.name] = "unreadable"
      }
    }
    return { loaded, skipped }
  }

  private readRecentEvents(
    projectRoot: string,
    maxEvents: number,
  ): { events: ToolEvent[]; dropped: number } {
    const eventsPath = join(projectRoot, ".opencode", "flowdeck-events.jsonl")
    if (!existsSync(eventsPath)) return { events: [], dropped: 0 }

    try {
      const content = readFileSync(eventsPath, "utf-8")
      const cutoff = Date.now() - this.options.eventMaxAgeMinutes * 60 * 1000
      const events: ToolEvent[] = []
      let dropped = 0

      // Read most-recent-first so we keep the freshest events when capped.
      for (const line of content.split("\n").reverse()) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as ToolEvent
          const ts = event.timestamp ? new Date(event.timestamp).getTime() : 0
          if (ts && ts < cutoff) {
            dropped += 1
            continue
          }
          if (events.length >= maxEvents) {
            dropped += 1
            continue
          }
          events.push(event)
        } catch {
          dropped += 1
        }
      }

      return { events: events.reverse(), dropped }
    } catch {
      return { events: [], dropped: 0 }
    }
  }

  private selectRelevantRules(
    projectRoot: string,
    description: string,
    state: PlanningState,
    route: RouterWorkflowRoute,
    maxRules: number,
  ): string[] {
    const __dir = dirname(fileURLToPath(import.meta.url))
    const rulesDir = join(__dir, "..", "rules")
    if (!existsSync(rulesDir)) return []

    const stage = route.stages[0]?.name
    const languages = detectProjectLanguages(projectRoot)
    const selection = selectRulePaths(rulesDir, { languages, stage })

    const seen = new Set<string>()
    const result: string[] = []
    for (const rule of selection.selected) {
      const name = basename(rule.path)
      if (seen.has(name)) continue
      seen.add(name)
      result.push(rule.path)
      if (result.length >= maxRules) break
    }
    // Suppress unused-var warning for state (kept for future stage gating)
    void state
    void description
    return result
  }

  private selectRelevantSkills(description: string, maxSkills: number): string[] {
    const __dir = dirname(fileURLToPath(import.meta.url))
    const skillsDir = join(__dir, "..", "skills")
    if (!existsSync(skillsDir)) return []

    const keywords = this.extractKeywords(description)
    const matches: { name: string; score: number }[] = []

    try {
      for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const name = entry.name
        const nameWords = name.split("-")
        let score = 0
        for (const keyword of keywords) {
          if (name === keyword || nameWords.includes(keyword)) {
            score += 2
          } else if (name.includes(keyword)) {
            score += 1
          }
        }
        if (score > 0) matches.push({ name, score })
      }
    } catch {
      return []
    }

    matches.sort((a, b) => b.score - a.score)

    const seen = new Set<string>()
    const result: string[] = []
    for (const { name } of matches) {
      if (seen.has(name)) continue
      seen.add(name)
      result.push(name)
      if (result.length >= maxSkills) break
    }
    return result
  }

  private extractKeywords(description: string): string[] {
    const normalized = description.toLowerCase().replace(/[^a-z0-9\s\-/]/g, " ")
    const words = normalized
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .filter(w => !["the", "and", "for", "this", "that", "with", "from", "into", "onto"].includes(w))
    return [...new Set(words)]
  }

  // ─── Tool selection ─────────────────────────────────────────────────────

  private selectToolFamilyForIntent(
    description: string,
    heuristics: ReturnType<typeof computeRoutingHeuristics>,
    route: RouterWorkflowRoute,
    availability: McpAvailability[],
    projectRoot: string,
  ): { primary: ToolFamily; fallbacks: ToolFamily[] } {
    // Deterministic intent priority (highest → lowest):
    //   1. web_research     — open-ended web/external lookup
    //   2. library_docs     — specific library/framework API lookup
    //   3. code_graph_understanding — when codegraph is ready AND the task
    //      actually needs structural code understanding (not a quick
    //      search/rename)
    //   4. token_sensitive_reading — when the description says the read
    //      will blow through the budget
    //   5. general          — anything else
    //
    // This priority is stable: the FIRST matching intent wins. Tests pin
    // the order so a future refactor cannot silently change which family
    // a given description resolves to.
    const isWebResearch = isWebResearchDescription(description)
    const isLibraryDocs = isLibraryDocsDescription(description)
    const needsGraph =
      heuristics.needsCodeUnderstanding ||
      route.workflowClass === "verify-heavy" ||
      route.workflowClass === "standard"
    const tokenSensitive = isTokenSensitiveDescription(description)
    // Codegraph is only preferred when the MCP is available AND the project
    // actually has an indexed + fresh codegraph. The MCP availability list
    // only reports install-level readiness; we still need the on-disk state
    // to claim the tool is usable. isCodegraphIndexed / isCodegraphFresh are
    // pure filesystem checks — they don't shell out and stay fast.
    const cgAvail = availability.find(a => a.name === "codegraph")?.available ?? false
    const cgIndexed = isCodegraphIndexed(projectRoot)
    const cgFresh = isCodegraphFresh(projectRoot)
    const codegraphReady = cgAvail && cgIndexed && cgFresh

    if (isWebResearch) {
      return selectToolFamily({
        intent: "web_research",
        availability,
      })
    }
    if (isLibraryDocs) {
      return selectToolFamily({
        intent: "library_docs",
        availability,
      })
    }
    if (needsGraph && codegraphReady) {
      return selectToolFamily({
        intent: "code_graph_understanding",
        availability,
        codegraphReady: true,
      })
    }
    if (tokenSensitive) {
      return selectToolFamily({
        intent: "token_sensitive_reading",
        tokenSensitive: true,
        availability,
      })
    }
    // Otherwise, default to general — keep the policy call so logs surface
    // the chain even for the "nothing specialized" case.
    return selectToolFamily({
      intent: "general",
      availability,
    })
  }

  // ─── Token budget ───────────────────────────────────────────────────────

  private computeTokenBudget(payload: {
    state: PlanningState
    planContent: string
    codebaseDocs: Record<string, string>
    recentEvents: ToolEvent[]
    relevantRules: string[]
    relevantSkills: string[]
  }): TokenBudgetSnapshot {
    const used =
      JSON.stringify(payload.state).length +
      payload.planContent.length +
      JSON.stringify(payload.codebaseDocs).length +
      JSON.stringify(payload.recentEvents).length +
      JSON.stringify(payload.relevantRules).length +
      JSON.stringify(payload.relevantSkills).length

    const total = this.options.totalTokenBudget
    const remaining = Math.max(0, total - used)
    return {
      usedTokens: used,
      totalTokens: total,
      remainingTokens: remaining,
      percentUsed: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0,
    }
  }
}

/** Convenience factory used by the plugin entry point. */
export function createContextIngressService(
  options?: ContextIngressOptions,
): ContextIngressService {
  return new ContextIngressService(options)
}
