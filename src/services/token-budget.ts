/**
 * Token Budget Service
 *
 * Provides INPUT size budgets and soft response directives by workflow stage
 * and task complexity. These are GUIDANCE values, not hard limits
 * (OpenCode SDK does not expose a max_tokens parameter on session.prompt).
 *
 * Hard controls apply to INPUT: context_chars_limit and prompt_chars_limit
 * cap carry-forward and total prompt size before sending.
 *
 * Soft controls: response_directive is a hint string appended to the prompt.
 * It asks the model to be concise — not enforced at the API level.
 */
import type { WorkflowStage } from "./token-metrics"
import type { TaskComplexity } from "./model-router"

export interface TokenBudget {
  /** Hard cap on context/carry-forward chars (apply before sending). */
  context_chars_limit: number
  /** Hard cap on total prompt chars including system instructions. */
  prompt_chars_limit: number
  /**
   * Soft directive to append to the prompt.
   * Empty string = no constraint injected.
   * This is guidance only — not API-enforced.
   */
  response_directive: string
}

// Base budgets by stage (~4 chars per token)
const STAGE_BASE: Record<WorkflowStage, { context: number; prompt: number; directive: string }> = {
  discuss:      { context:  6_000, prompt: 10_000, directive: "" },
  plan:         { context:  8_000, prompt: 14_000, directive: "" },
  execute:      { context: 12_000, prompt: 20_000, directive: "" },
  verify:       { context:  6_000, prompt: 10_000, directive: "Be concise. Return structured findings." },
  design:       { context:  8_000, prompt: 14_000, directive: "" },
  "fix-bug":    { context:  8_000, prompt: 14_000, directive: "" },
  "write-docs": { context:  6_000, prompt: 10_000, directive: "" },
  council:      { context:  4_000, prompt:  8_000, directive: "Be concise." },
  delegate:     { context:  4_000, prompt:  8_000, directive: "" },
  pipeline:     { context:  8_000, prompt: 14_000, directive: "" },
  exploration:  { context: 10_000, prompt: 16_000, directive: "" },
  unknown:      { context:  8_000, prompt: 12_000, directive: "" },
}

// Complexity multipliers: cheap tasks get tighter budgets to encourage brevity
const COMPLEXITY_MULT: Record<TaskComplexity, number> = {
  cheap:     0.4,
  standard:  1.0,
  expensive: 1.5,
}

/**
 * Get the token budget for a given workflow stage and task complexity.
 * Cheap tasks receive ~40% of the base budget; expensive tasks receive ~150%.
 */
export function getTokenBudget(stage: WorkflowStage, complexity: TaskComplexity): TokenBudget {
  const base = STAGE_BASE[stage] ?? STAGE_BASE.unknown
  const mult = COMPLEXITY_MULT[complexity] ?? 1.0
  const context_chars_limit = Math.ceil(base.context * mult)
  const prompt_chars_limit = Math.ceil(base.prompt * mult)

  let response_directive = base.directive
  if (complexity === "cheap" && !response_directive) {
    response_directive = "Be brief. Return a concise answer."
  }

  return { context_chars_limit, prompt_chars_limit, response_directive }
}

/**
 * Truncate a carry-forward context to fit within budget.
 * Preserves the most recent content (tail) when truncating.
 * Attempts to trim to a line boundary to avoid mid-line cuts.
 */
export function applyContextBudget(context: string, budget: TokenBudget): string {
  if (context.length <= budget.context_chars_limit) return context
  const truncated = context.slice(context.length - budget.context_chars_limit)
  const firstNewline = truncated.indexOf("\n")
  return firstNewline > 0 ? truncated.slice(firstNewline + 1) : truncated
}

/**
 * Append the response directive to a prompt, if one is set for this budget.
 * Returns the prompt unchanged when no directive applies.
 */
export function applyResponseDirective(prompt: string, budget: TokenBudget): string {
  if (!budget.response_directive) return prompt
  return `${prompt}\n\n[${budget.response_directive}]`
}
