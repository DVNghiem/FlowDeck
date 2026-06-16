interface FailureEntry {
  tool: string
  filePath?: string
  error: string
  attempts: number
}

const sessionFailures = new Map<string, Map<string, FailureEntry>>()

function failureKey(tool: string, filePath?: string): string {
  return `${tool}::${filePath ?? "__no_file__"}`
}

export function recordToolFailure(
  sessionID: string,
  tool: string,
  error: string,
  filePath?: string,
): void {
  const failures = sessionFailures.get(sessionID) ?? new Map()
  const key = failureKey(tool, filePath)
  const existing = failures.get(key)
  if (existing) {
    existing.attempts++
    existing.error = error
  } else {
    failures.set(key, { tool, filePath, error, attempts: 1 })
  }
  sessionFailures.set(sessionID, failures)
}

export function getFailureWarning(sessionID: string): string {
  const failures = sessionFailures.get(sessionID)
  if (!failures) return ""
  const repeated = [...failures.values()].filter(f => f.attempts > 1)
  if (repeated.length === 0) return ""
  return [
    "[FlowDeck Failure Memory] These approaches already failed in this session:",
    ...repeated.map(f =>
      `• ${f.tool}${f.filePath ? ` on ${f.filePath}` : ""} — ` +
      `"${f.error.slice(0, 100)}" (${f.attempts} attempts)`
    ),
    "Do NOT retry the same approach. Use a different strategy or escalate to the orchestrator.",
  ].join("\n")
}

export function clearSessionFailures(sessionID: string): void {
  sessionFailures.delete(sessionID)
}
