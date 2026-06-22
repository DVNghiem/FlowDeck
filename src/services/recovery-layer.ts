/**
 * Recovery Layer
 *
 * Discriminated union for recovery actions emitted by the supervisor loop.
 */

export type RecoveryAction =
  | { kind: "retry"; reason: string; maxAttempts: number; delayMs: number }
  | { kind: "switch_agent"; reason: string; from: string; to: string }
  | { kind: "escalate"; reason: string; target: "human" | "orchestrator" }
  | { kind: "stop"; reason: string; terminal: true }

export interface RecoveryRecommendation {
  action: RecoveryAction
  confidence: number
  audit: Record<string, unknown>
}

/**
 * Recommend a recovery action based on failure context.
 */
export function recommendRecovery(
  failureCount: number,
  agentName: string,
  reason: string,
  availableAgents: string[],
): RecoveryRecommendation {
  const audit: Record<string, unknown> = { failureCount, agentName, reason }

  if (failureCount === 0) {
    return {
      action: { kind: "retry", reason, maxAttempts: 1, delayMs: 0 },
      confidence: 1,
      audit,
    }
  }

  if (failureCount === 1) {
    return {
      action: { kind: "retry", reason: `${reason} (second attempt)`, maxAttempts: 1, delayMs: 1000 },
      confidence: 0.8,
      audit,
    }
  }

  const fallback = pickFallbackAgent(agentName, availableAgents)
  if (fallback) {
    return {
      action: { kind: "switch_agent", reason: `Agent ${agentName} failed ${failureCount} times`, from: agentName, to: fallback },
      confidence: 0.6,
      audit: { ...audit, fallback },
    }
  }

  if (failureCount >= 3) {
    return {
      action: { kind: "stop", reason: `Agent ${agentName} exhausted retries: ${reason}`, terminal: true },
      confidence: 0.9,
      audit,
    }
  }

  return {
    action: { kind: "escalate", reason, target: "orchestrator" },
    confidence: 0.5,
    audit,
  }
}

function pickFallbackAgent(current: string, available: string[]): string | null {
  const preferred: Record<string, string[]> = {
    "backend-coder": ["frontend-coder", "debug-specialist"],
    "frontend-coder": ["backend-coder", "design"],
    "debug-specialist": ["build-error-resolver", "backend-coder"],
    "build-error-resolver": ["debug-specialist", "backend-coder"],
    "planner": ["architect", "discusser"],
    "researcher": ["code-explorer"],
  }
  for (const candidate of preferred[current] ?? []) {
    if (candidate !== current && available.includes(candidate)) return candidate
  }
  return available.find((a) => a !== current) ?? null
}

export function formatRecoveryAction(action: RecoveryAction): string {
  switch (action.kind) {
    case "retry":
      return `retry (maxAttempts=${action.maxAttempts}, delayMs=${action.delayMs}): ${action.reason}`
    case "switch_agent":
      return `switch_agent ${action.from} -> ${action.to}: ${action.reason}`
    case "escalate":
      return `escalate to ${action.target}: ${action.reason}`
    case "stop":
      return `stop: ${action.reason}`
  }
}
