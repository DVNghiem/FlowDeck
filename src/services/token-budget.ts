/**
 * Token Budget Service
 *
 * Simple component breakdown surfaced in session-start. Does not require real
 * token usage to be present; falls back to character-based estimates.
 */

export interface TokenBudgetBreakdown {
  /** Estimated tokens available for this session */
  total: number
  /** Reserved for system/rules/agent prompts */
  overhead: number
  /** Reserved for codebase/planning context */
  context: number
  /** Reserved for user task description and ongoing conversation */
  conversation: number
  /** Reserved for tool outputs and exploration */
  working: number
  /** Tokens already consumed if tracked */
  used: number
  /** Remaining budget */
  remaining: number
}

const DEFAULT_TOTAL_BUDGET = 120_000
const OVERHEAD_PCT = 0.15
const CONTEXT_PCT = 0.35
const CONVERSATION_PCT = 0.20
const WORKING_PCT = 0.30

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Build a deterministic token budget breakdown from optional inputs.
 *
 * Context estimate is composed of:
 * - plan/context bytes (supplied as contextEstimate or default percentage)
 * - lessons bytes
 * - rules bytes
 *
 * @param used - tokens already consumed (default 0)
 * @param contextEstimate - estimated tokens for plan/context (optional; defaults to 35% of total)
 * @param totalBudget - total budget cap (default 120k)
 * @param lessonsBytes - bytes of lessons content to include in context estimate (default 0)
 * @param rulesBytes - bytes of language rules content to include in context estimate (default 0)
 */
export function buildTokenBudget(
  used = 0,
  contextEstimate?: number,
  totalBudget = DEFAULT_TOTAL_BUDGET,
  lessonsBytes = 0,
  rulesBytes = 0,
): TokenBudgetBreakdown {
  const total = Math.max(1, totalBudget)
  const overhead = Math.round(total * OVERHEAD_PCT)
  const baseContext = contextEstimate ?? Math.round(total * CONTEXT_PCT)
  const lessonsTokens = estimateTokensFromBytes(lessonsBytes)
  const rulesTokens = estimateTokensFromBytes(rulesBytes)
  const context = baseContext + lessonsTokens + rulesTokens
  const conversation = Math.round(total * CONVERSATION_PCT)
  const working = Math.round(total * WORKING_PCT)
  const remaining = clamp(total - used, 0, total)

  return {
    total,
    overhead,
    context,
    conversation,
    working,
    used,
    remaining,
  }
}

/**
 * Estimate context tokens from a byte count using a rough 4-char-per-token ratio.
 */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / 4)
}
