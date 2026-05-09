export type TaskType =
  | "planning"
  | "design"
  | "implementation"
  | "debugging"
  | "review"
  | "testing"
  | "documentation"
  | "analysis"
  | "security"
  | "orchestration"

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
  if (a.includes("design") || a.includes("ui-ux")) return "design"
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
    value === "design" ||
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

const UI_HEAVY_KEYWORDS = [
  "landing page",
  "marketing site",
  "website",
  "web app",
  "mobile app",
  "app screen",
  "dashboard",
  "admin panel",
  "settings page",
  "onboarding ux",
  "kanban",
  "design system",
  "responsive",
  "ui",
  "ux",
  "cta",
  "conversion flow",
  "saas interface",
  "user-facing",
]

const NON_UI_KEYWORDS = [
  "backend",
  "infrastructure",
  "migration",
  "pipeline",
  "api only",
  "database only",
  "cli",
  "worker",
]

export function isUiHeavyTask(input: string): boolean {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return false
  const hasUiSignal = UI_HEAVY_KEYWORDS.some((keyword) => normalized.includes(keyword))
  if (!hasUiSignal) return false
  const hasOnlyNonUiSignals = NON_UI_KEYWORDS.some((keyword) => normalized.includes(keyword)) && !normalized.includes("frontend")
  return !hasOnlyNonUiSignals
}

export type UiTaskType =
  | "landing-page"
  | "dashboard"
  | "admin-panel"
  | "marketing-site"
  | "mobile-app"
  | "saas-app"
  | "internal-tool"
  | "app-screen"
  | "general-ui"

export function classifyUiTaskType(input: string): UiTaskType | null {
  const normalized = input.trim().toLowerCase()
  if (!isUiHeavyTask(normalized)) return null
  if (normalized.includes("landing page")) return "landing-page"
  if (normalized.includes("dashboard")) return "dashboard"
  if (normalized.includes("admin panel")) return "admin-panel"
  if (normalized.includes("marketing site")) return "marketing-site"
  if (normalized.includes("mobile app")) return "mobile-app"
  if (normalized.includes("saas")) return "saas-app"
  if (normalized.includes("internal tool")) return "internal-tool"
  if (normalized.includes("screen")) return "app-screen"
  return "general-ui"
}
