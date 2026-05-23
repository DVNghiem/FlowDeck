export interface RecommendedQuestion {
  question: string
  recommendation: string
  rationale: string
  alternatives?: string[]
  defaultIfNoResponse: string
}

/**
 * Render a RecommendedQuestion to a human-readable string format.
 */
export function formatRecommendedQuestion(q: RecommendedQuestion): string {
  let out = `Question:\n${q.question}\n\nRecommendation:\n${q.recommendation}\n\nRationale:\n${q.rationale}\n\n`
  if (q.alternatives && q.alternatives.length > 0) {
    out += `Alternatives:\n${q.alternatives.map(a => `- ${a}`).join("\n")}\n\n`
  }
  out += `Default if no response:\n${q.defaultIfNoResponse}`
  return out
}

/**
 * Type guard — returns true only if the value is a valid RecommendedQuestion
 * with all required fields present and non-empty.
 *
 * Also returns false for trivially bare question patterns.
 */
export function validateRecommendedQuestion(value: unknown): value is RecommendedQuestion {
  if (value === null || value === undefined) return false
  if (typeof value !== "object") return false

  const q = value as Record<string, unknown>

  const requiredStringFields = ["question", "recommendation", "rationale", "defaultIfNoResponse"] as const
  for (const field of requiredStringFields) {
    if (typeof q[field] !== "string" || (q[field] as string).trim() === "") {
      return false
    }
  }

  // Reject bare question patterns
  const questionLower = (q.question as string).toLowerCase()
  const BARE_PATTERNS = [
    "what do you want",
    "which do you prefer",
    "what should i do",
    "should i continue",
    "do you want to",
    "tell me what",
  ]
  if (BARE_PATTERNS.some(p => questionLower.includes(p))) {
    return false
  }

  if (q.alternatives !== undefined) {
    if (!Array.isArray(q.alternatives)) return false
    for (const alt of q.alternatives) {
      if (typeof alt !== "string") return false
    }
  }

  return true
}

/**
 * Parse a formatted RecommendedQuestion string back into an object.
 * Returns null if the text does not contain the required fields.
 */
export function parseQuestionBlocks(text: string): RecommendedQuestion | null {
  const lines = text.split("\n")
  const get = (label: string): string | undefined => {
    const idx = lines.findIndex(l => l.trim().endsWith(label + ":") || l.trim() === label + ":")
    if (idx === -1) return undefined
    const value = lines[idx + 1]
    return value?.trim()
  }

  const question = get("Question")
  const recommendation = get("Recommendation")
  const rationale = get("Rationale")
  const defaultIfNoResponse = get("Default if no response")

  if (!question || !recommendation || !rationale || !defaultIfNoResponse) {
    return null
  }

  const alternativesIdx = lines.findIndex(l => l.startsWith("Alternatives:"))
  let alternatives: string[] | undefined
  if (alternativesIdx !== -1) {
    alternatives = []
    for (let i = alternativesIdx + 1; i < lines.length; i++) {
      const line = lines[i]!
      // Stop at empty line or next section label
      if (line.trim() === "") break
      if (/^[A-Z][a-z]/.test(line) && line.endsWith(":")) break
      alternatives.push(line.trim())
    }
  }

  return {
    question,
    recommendation,
    rationale,
    alternatives: alternatives?.length ? alternatives : undefined,
    defaultIfNoResponse,
  }
}