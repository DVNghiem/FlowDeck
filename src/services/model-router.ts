/**
 * Model Router Service
 *
 * Classifies task complexity and maps agents to cost tiers.
 * Routes cheap tasks away from expensive models and provides
 * orchestrator-prompt slimming via stage-aware agent filtering.
 *
 * IMPORTANT: This service is telemetry/guidance only.
 * It does NOT change which model OpenCode uses for each call.
 * Actual model switching requires caller integration (flagged with TODO).
 */

export type TaskComplexity = "cheap" | "standard" | "expensive"

export type AgentTier = "cheap" | "standard" | "expensive"

export interface RoutingDecision {
  complexity: TaskComplexity
  reason: string
  /** Agents that are appropriate for this complexity tier */
  eligible_agents: string[]
}

// ----- Task complexity patterns -----

const CHEAP_TASK_PATTERNS: RegExp[] = [
  /^classify\b/i,
  /^validate\b/i,
  /^check\s+(if|whether|that)\b/i,
  /^format\b/i,
  /^summarize\b/i,
  /^rewrite\s+question/i,
  /\bis\s+this\b.{0,40}\?$/i,
  /\byes\s+or\s+no\b/i,
  /^list\b/i,
  /^count\b/i,
  /^translate\b/i,
  /^extract\s+(all\s+)?(names?|tags?|labels?|keys?)\b/i,
  /^lint\b/i,
  /^parse\b/i,
  /^convert\b/i,
]

const EXPENSIVE_TASK_PATTERNS: RegExp[] = [
  /\barchitect(ure)?\b/i,
  /\bsystem\s+design\b/i,
  /\brefactor\s+(the\s+)?entire\b/i,
  /\bcomplex\s+(bug|issue|problem)\b/i,
  /\bdebugging\b/i,
  /\bsecurity\s+(audit|review|analysis|vulnerabilit)/i,
  /\bperformance\s+(optimization|analysis|profiling)\b/i,
  /\bmigration\s+strategy\b/i,
  /\bcross[- ]cutting\b/i,
  /\bmulti[- ](file|module|service)\b/i,
  /\btradeoffs?\b/i,
  /\bnuanced\b/i,
  /\bwhy\s+(is|does|did|are|were)\b.{10,}/i,
]

export function classifyTaskComplexity(task: string): RoutingDecision {
  const trimmed = task.trim()

  if (EXPENSIVE_TASK_PATTERNS.some(p => p.test(trimmed))) {
    return {
      complexity: "expensive",
      reason: "matches expensive pattern (architecture/debug/security/performance)",
      eligible_agents: EXPENSIVE_TIER_AGENTS,
    }
  }

  if (CHEAP_TASK_PATTERNS.some(p => p.test(trimmed))) {
    return {
      complexity: "cheap",
      reason: "matches cheap pattern (classify/validate/format/summarize)",
      eligible_agents: CHEAP_TIER_AGENTS,
    }
  }

  return {
    complexity: "standard",
    reason: "no specific tier pattern matched",
    eligible_agents: STANDARD_TIER_AGENTS,
  }
}

// ----- Agent tier assignments -----

const CHEAP_TIER_AGENTS = [
  "default-executor",
  "doc-updater",
  "task-splitter",
]

const STANDARD_TIER_AGENTS = [
  "discusser",
  "planner",
  "researcher",
  "code-explorer",
  "backend-coder",
  "frontend-coder",
  "tester",
  "reviewer",
  "devops",
  "design",
  "writer",
  "task-splitter",
]

const EXPENSIVE_TIER_AGENTS = [
  "architect",
  "debug-specialist",
  "security-auditor",
  "build-error-resolver",
  "supervisor",
  "orchestrator",
  "planner",
  "researcher",
  "backend-coder",
]

const AGENT_TIER_MAP: Record<string, AgentTier> = {
  // cheap — classification, routing, validation
  "task-splitter": "cheap",
  // standard — normal coding, research, planning
  "discusser": "standard",
  "planner": "standard",
  "researcher": "standard",
  "code-explorer": "standard",
  "backend-coder": "standard",
  "frontend-coder": "standard",
  "tester": "standard",
  "reviewer": "standard",
  "devops": "standard",
  "design": "standard",
  // expensive — architecture, security, debugging
  "architect": "expensive",
  "debug-specialist": "expensive",
  "security-auditor": "expensive",
  "build-error-resolver": "expensive",
  "supervisor": "expensive",
  "orchestrator": "expensive",
  "plan-checker": "standard",
}

export function getTierForAgent(agentName: string): AgentTier {
  return AGENT_TIER_MAP[agentName] ?? "standard"
}

// ----- Stage-aware agent filtering -----

/**
 * Maps workflow stages to the subset of agents that are relevant.
 * Used by the orchestrator to slim the prompt from ~3K tokens of agent
 * descriptions down to the ~500-800 tokens needed for the current stage.
 */
const STAGE_AGENT_ALLOWLISTS: Record<string, string[]> = {
  discuss: [
    "discusser",
    "researcher",
    "code-explorer",
    "supervisor",
    "task-splitter",
    "architect",
  ],
  plan: [
    "planner",
    "architect",
    "researcher",
    "code-explorer",
    "task-splitter",
    "plan-checker",
  ],
  design: [
    "design",
    "architect",
    "researcher",
    "task-splitter",
    "reviewer",
  ],
  execute: [
    "backend-coder",
    "frontend-coder",
    "code-explorer",
    "devops",
    "tester",
    "reviewer",
    "debug-specialist",
    "build-error-resolver",
  ],
  verify: [
    "tester",
    "reviewer",
    "security-auditor",
    "build-error-resolver",
    "code-explorer",
    "debug-specialist",
  ],
  "fix-bug": [
    "debug-specialist",
    "backend-coder",
    "frontend-coder",
    "build-error-resolver",
    "tester",
    "code-explorer",
    "reviewer",
  ],
  "write-docs": [
    "writer",
    "doc-updater",
    "researcher",
    "code-explorer",
    "reviewer",
  ],
}

/**
 * Returns the set of agents relevant to the given workflow stage.
 * Returns undefined if the stage is unknown (caller should use full list).
 */
export function filterAgentsForStage(stage: string): string[] | undefined {
  const allowlist = STAGE_AGENT_ALLOWLISTS[stage]
  if (!allowlist) return undefined
  return allowlist
}

/**
 * Returns agent names to DISABLE for the given stage.
 * Useful for `buildOrchestratorPrompt(disabledAgents)` which takes a disallow-set.
 *
 * @param stage - workflow stage name
 * @param allAgents - complete list of registered agent names
 */
export function getDisabledAgentsForStage(stage: string, allAgents: string[]): Set<string> {
  const allowlist = STAGE_AGENT_ALLOWLISTS[stage]
  if (!allowlist) return new Set()
  const allowed = new Set(allowlist)
  const disabled = new Set<string>()
  for (const agent of allAgents) {
    if (!allowed.has(agent)) disabled.add(agent)
  }
  return disabled
}

/**
 * Tally of agents that would be shown vs hidden for each stage.
 * Used for reporting/telemetry.
 */
export function computePromptSlimmingStats(
  allAgents: string[],
): Record<string, { shown: number; hidden: number; saving_pct: number }> {
  const result: Record<string, { shown: number; hidden: number; saving_pct: number }> = {}
  for (const [stage, allowlist] of Object.entries(STAGE_AGENT_ALLOWLISTS)) {
    const shown = allowlist.filter(a => allAgents.includes(a)).length
    const total = allAgents.length
    const hidden = total - shown
    result[stage] = {
      shown,
      hidden,
      saving_pct: total > 0 ? Math.round((hidden / total) * 100) : 0,
    }
  }
  return result
}

/**
 * Return a soft output-format hint to prepend to prompts for cheap tasks.
 * For cheap/classification tasks, requests compact JSON output to reduce prose.
 * Returns an empty string for standard/expensive tasks (no constraint injected).
 *
 * This is guidance only — not enforced at the API level.
 */
export function getOutputFormatHint(complexity: TaskComplexity): string {
  if (complexity === "cheap") {
    return "Respond with a compact JSON object only. No prose, no explanation."
  }
  return ""
}
