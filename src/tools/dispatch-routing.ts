import type { TaskType } from "../services/model-router"

export function shouldRetry(promptRes: any): boolean {
  if (!promptRes) return false
  const detail = (promptRes.error as { detail?: string } | null)?.detail
  if (isTransientError(detail)) return true
  const infoError = promptRes.data?.info?.error
  const text = typeof infoError === "string" ? infoError : JSON.stringify(infoError ?? "")
  return isTransientError(text)
}

export function isTransientError(text?: string): boolean {
  if (!text) return false
  const haystack = text.toLowerCase()
  return (
    haystack.includes("overload") ||
    haystack.includes("rate limit") ||
    haystack.includes("timeout") ||
    haystack.includes("temporar") ||
    haystack.includes("econnreset")
  )
}

export function normalizeTaskType(taskType: string | undefined, agent: string): TaskType {
  const normalized = (taskType ?? "").trim().toLowerCase()
  if (isTaskType(normalized)) return normalized

  const a = agent.toLowerCase()
  if (a.includes("review")) return "review"
  if (a.includes("test")) return "testing"
  if (a.includes("debug")) return "debugging"
  if (a.includes("security")) return "security"
  if (a.includes("doc")) return "documentation"
  if (a.includes("architect") || a.includes("planner")) return "planning"
  if (a.includes("orchestrator") || a.includes("coordinator")) return "orchestration"
  if (a.includes("analyst") || a.includes("research")) return "analysis"
  return "implementation"
}

export function isTaskType(value: string): value is TaskType {
  return (
    value === "planning" ||
    value === "implementation" ||
    value === "debugging" ||
    value === "review" ||
    value === "testing" ||
    value === "documentation" ||
    value === "analysis" ||
    value === "security" ||
    value === "orchestration"
  )
}
