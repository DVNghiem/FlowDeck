/**
 * Context Ingress Service
 *
 * Assembles the runtime context for a command execution:
 *  - planning state (STATE.md)
 *  - plan content (PLAN.md)
 *  - .codebase/ documentation
 *  - recent tool/session events
 *  - task complexity classification
 *  - relevant rules and skills
 *  - token budget snapshot
 *  - trivial-chat short-circuit
 *
 * The service is advisory: it does not block execution and does not mutate
 * external state except through explicit dependencies injected by the caller.
 */

import { existsSync, readFileSync, readdirSync } from "fs"
import { join, basename } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

import type { FlowDeckConfig } from "../config/schema"
import { readPlanningState, type PlanningState } from "../tools/planning-state-lib"
import { classifyTaskComplexity, type RoutingDecision } from "./model-router"
import { detectProjectLanguages, selectRulePaths } from "./lazy-rule-loader"
import type { ToolEvent } from "./event-logger"
import {
  type AssembledContext,
  type Observation,
  type TokenBudgetSnapshot,
  type WorkflowRoute,
} from "./harness-types"

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
}

export interface ContextIngressOptions {
  maxEvents?: number
  eventMaxAgeMinutes?: number
  planTruncateThreshold?: number
  planTruncateTo?: number
  totalTokenBudget?: number
}

const DEFAULT_OPTIONS: Required<ContextIngressOptions> = {
  maxEvents: 20,
  eventMaxAgeMinutes: 30,
  planTruncateThreshold: 8000,
  planTruncateTo: 4000,
  totalTokenBudget: 100_000,
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

export class ContextIngressService {
  private options: Required<ContextIngressOptions>

  constructor(options: ContextIngressOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  assemble(input: ContextIngressInput): AssembledContext {
    const trivial = isTrivialChat(input.description)

    const state = readPlanningState(input.projectRoot)
    const planContent = this.readPlanContent(input.projectRoot, state)

    const codebaseDocs = trivial.isTrivialChat
      ? {}
      : this.readCodebaseDocs(input.projectRoot)

    const recentEvents = trivial.isTrivialChat
      ? []
      : this.readRecentEvents(input.projectRoot)

    const route = this.buildRoute(input.description)

    const relevantRules = trivial.isTrivialChat
      ? []
      : this.selectRelevantRules(input.projectRoot, input.description, state, route)

    const relevantSkills = trivial.isTrivialChat
      ? []
      : this.selectRelevantSkills(input.description)

    const observations: Observation[] = []

    const tokenBudget = this.computeTokenBudget({
      state,
      planContent,
      codebaseDocs,
      recentEvents,
      relevantRules,
      relevantSkills,
    })

    return {
      runId: input.runId,
      sessionId: input.sessionId,
      projectRoot: input.projectRoot,
      state: state as unknown as Record<string, unknown>,
      route,
      relevantRules,
      relevantSkills,
      recentEvents,
      observations,
      tokenBudget,
      isTrivialChat: trivial.isTrivialChat,
    }
  }

  private readPlanContent(projectRoot: string, state: PlanningState): string {
    const planningDir = join(projectRoot, ".planning")
    const planPath = join(planningDir, "PLAN.md")
    if (!existsSync(planPath)) return ""

    try {
      let content = readFileSync(planPath, "utf-8")
      if (content.length > this.options.planTruncateThreshold) {
        content = `${content.slice(0, this.options.planTruncateTo)}\n\n[PLAN.md truncated: ${content.length} chars]`
      }
      return content
    } catch {
      return ""
    }
  }

  private readCodebaseDocs(projectRoot: string): Record<string, string> {
    const codebaseDir = join(projectRoot, ".codebase")
    if (!existsSync(codebaseDir)) return {}

    const docs: Record<string, string> = {}
    try {
      for (const file of readdirSync(codebaseDir)) {
        if (!file.endsWith(".md")) continue
        const filePath = join(codebaseDir, file)
        try {
          docs[file] = readFileSync(filePath, "utf-8")
        } catch {
          // Skip unreadable docs
        }
      }
    } catch {
      // Ignore directory read failures
    }
    return docs
  }

  private readRecentEvents(projectRoot: string): ToolEvent[] {
    const eventsPath = join(projectRoot, ".opencode", "flowdeck-events.jsonl")
    if (!existsSync(eventsPath)) return []

    try {
      const content = readFileSync(eventsPath, "utf-8")
      const cutoff = Date.now() - this.options.eventMaxAgeMinutes * 60 * 1000
      const events: ToolEvent[] = []

      for (const line of content.split("\n").reverse()) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as ToolEvent
          const ts = event.timestamp ? new Date(event.timestamp).getTime() : 0
          if (ts && ts < cutoff) continue
          events.push(event)
          if (events.length >= this.options.maxEvents) break
        } catch {
          // Skip malformed lines
        }
      }

      return events.reverse()
    } catch {
      return []
    }
  }

  private buildRoute(description: string): WorkflowRoute {
    const decision = classifyTaskComplexity(description)
    const workflowClass = this.mapComplexityToWorkflowClass(decision)
    return {
      workflowClass,
      stages: this.inferStages(workflowClass, decision),
      criteria: { complexity: decision.complexity },
      scores: {
        simplicity: decision.complexity === "cheap" ? 0.9 : 0.5,
        confidence: 0.6,
        lowRisk: decision.complexity === "cheap" ? 0.9 : 0.5,
        knownCodebase: 0.5,
        cheapComplexity: decision.complexity === "cheap" ? 1 : 0,
        total: 0,
      },
      reason: decision.reason,
    }
  }

  private mapComplexityToWorkflowClass(decision: RoutingDecision): string {
    switch (decision.complexity) {
      case "cheap":
        return "quick"
      case "expensive":
        return "verify-heavy"
      default:
        return "standard"
    }
  }

  private inferStages(workflowClass: string, decision: RoutingDecision): string[] {
    if (workflowClass === "quick") return ["execute", "verify"]
    if (workflowClass === "verify-heavy") return ["plan", "execute", "verify"]
    if (decision.complexity === "expensive") return ["discuss", "plan", "execute", "verify"]
    return ["plan", "execute", "verify"]
  }

  private selectRelevantRules(
    projectRoot: string,
    description: string,
    state: PlanningState,
    route: WorkflowRoute,
  ): string[] {
    const __dir = dirname(fileURLToPath(import.meta.url))
    const rulesDir = join(__dir, "..", "rules")
    if (!existsSync(rulesDir)) return []

    const stage = this.inferStageFromRoute(route)
    const languages = detectProjectLanguages(projectRoot)
    const selection = selectRulePaths(rulesDir, { languages, stage })

    const seen = new Set<string>()
    const result: string[] = []
    for (const rule of selection.selected) {
      const name = basename(rule.path)
      if (seen.has(name)) continue
      seen.add(name)
      result.push(rule.path)
    }
    return result
  }

  private inferStageFromRoute(route: WorkflowRoute): string | undefined {
    // Use the first stage as the inferred stage for rule selection.
    return route.stages[0]
  }

  private selectRelevantSkills(description: string): string[] {
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
    }
    return result.slice(0, 10)
  }

  private extractKeywords(description: string): string[] {
    const normalized = description.toLowerCase().replace(/[^a-z0-9\s\-/]/g, " ")
    const words = normalized
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .filter(w => !["the", "and", "for", "this", "that", "with", "from", "into", "onto"].includes(w))
    return [...new Set(words)]
  }

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
