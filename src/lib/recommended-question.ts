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

/**
 * Arguments for OpenCode's built-in `question` tool.
 *
 * Mirrors the call schema the `question` tool accepts: a short `header`
 * shown in the picker UI, the full `question` body, and a list of
 * selectable `options` (the recommendation goes first so it is the
 * pre-highlighted default; alternatives follow).
 */
export interface QuestionToolArgs {
  header: string
  question: string
  options: string[]
}

const MAX_HEADER_LEN = 30

/**
 * Project a RecommendedQuestion into the argument shape expected by
 * OpenCode's built-in `question` tool.
 *
 * - `header` is a short label derived from the first few words of the
 *   question text (lowercased, capped at 30 chars). Falls back to
 *   "Decision" if no usable prefix can be extracted.
 * - `question` is the full question text plus the rationale and the
 *   default-if-no-response, so the human still sees both when the tool
 *   renders the picker body.
 * - `options` is `[recommendation, ...alternatives ?? []]` so the
 *   recommendation is the first/highlighted option. The tool's built-in
 *   "type a custom answer" escape hatch is always available to the
 *   user, even when `alternatives` is empty.
 *
 * `formatRecommendedQuestion` is preserved for any non-interactive
 * caller (logging, audit events, text-only contexts) that still needs
 * a human-readable rendering.
 */
export function toQuestionToolArgs(q: RecommendedQuestion): QuestionToolArgs {
  const headerSource = q.question.trim().split(/\s+/).slice(0, 5).join(" ")
  const header = (headerSource || "Decision").slice(0, MAX_HEADER_LEN).toLowerCase()

  const question = `${q.question}\n\nRationale: ${q.rationale}\n\nDefault if no response: ${q.defaultIfNoResponse}`

  const options = [q.recommendation, ...(q.alternatives ?? [])]

  return { header, question, options }
}

/**
 * A structured response that a FlowDeck tool returns.
 *
 * - `ok: true, data: T` — normal success response
 * - `ok: true, needsInput: true, question: RecommendedQuestion` — tool needs user input
 * - `ok: false, error: string` — tool failed
 */
export type ToolResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: true; needsInput: true; question: RecommendedQuestion }
  | { ok: false; error: string }

/**
 * Serialize a success response. Returns a JSON string a tool can return directly.
 */
export function success<T>(data: T): string {
  return JSON.stringify({ ok: true, data })
}

/**
 * Signal that the tool needs user input. Returns a JSON string the orchestrator/supervisor
 * can detect and route through the `question` tool.
 */
export function needsInput(question: RecommendedQuestion): string {
  return JSON.stringify({ ok: true, needsInput: true, question })
}

/**
 * Serialize an error response. Returns a JSON string a tool can return directly.
 */
export function toolError(error: string): string {
  return JSON.stringify({ ok: false, error })
}

/**
 * Parse a tool's string response into a structured ToolResponse.
 * Returns `null` if the string is not valid ToolResponse JSON.
 */
export function parseToolResponse<T = unknown>(json: string): ToolResponse<T> | null {
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
      if (parsed.ok === true) {
        if (parsed.needsInput === true && parsed.question) {
          if (!validateRecommendedQuestion(parsed.question)) {
            return null
          }
          return { ok: true, needsInput: true, question: parsed.question } as ToolResponse<T>
        }
        return { ok: true, data: parsed.data } as ToolResponse<T>
      }
      if (parsed.ok === false) {
        return { ok: false, error: parsed.error ?? 'Unknown error' }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Type guard — check if a ToolResponse signals that user input is needed.
 */
export function isNeedsInput<T>(response: ToolResponse<T>): response is ToolResponse<T> & { ok: true; needsInput: true; question: RecommendedQuestion } {
  return response.ok === true && 'needsInput' in response && response.needsInput === true
}

/**
 * Check if a tool response string is a user-input request without fully parsing.
 * Useful for quick routing decisions in the orchestrator.
 */
export function isNeedsInputString(json: string): boolean {
  try {
    const parsed = JSON.parse(json)
    return parsed?.ok === true && parsed?.needsInput === true
      && typeof parsed?.question === 'object' && parsed?.question !== null
      && 'question' in parsed.question && 'recommendation' in parsed.question
      && 'rationale' in parsed.question && 'defaultIfNoResponse' in parsed.question
  } catch {
    return false
  }
}