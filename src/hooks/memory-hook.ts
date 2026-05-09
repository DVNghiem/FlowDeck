import {
  initSession,
  storeObservation,
  storeSummary,
  getRecentSessions,
  getObservationsForSession,
  getContextForDirectory,
  getSessionByContentSessionId,
  type Session,
  type Observation,
  type HandoffMetadata,
} from "../services/memory-store"

const MAX_TOOL_RESPONSE = 10000
// Storage limit: 50 KB — large enough for the full structured 8-section summary.
const MAX_SUMMARY_STORAGE = 50000
// Context injection limit: keep prompts lean.
const MAX_CONTEXT_SUMMARY = 2000

interface SessionContext {
  sessionId: number
  contentSessionId: string
  project: string
  directory: string
}

const activeSessions = new Map<string, SessionContext>()

function extractProjectFromDirectory(directory: string): string {
  const parts = directory.split("/")
  return parts[parts.length - 1] || "unknown"
}

function truncate(str: string, max: number): string {
  if (!str || str.length <= max) return str || ""
  return str.slice(0, max)
}

/**
 * Derives a structured HandoffMetadata artifact from raw observations.
 * Fields that require LLM reasoning (key_decisions, blockers, etc.) are left
 * as empty arrays — the text summary from compaction carries that information.
 */
function buildHandoffMetadata(
  sessionId: number,
  directory: string,
  summaryText: string,
  observations: Observation[]
): HandoffMetadata {
  // Extract files touched by file-operation tools.
  const fileTools = new Set(["edit", "create", "view", "read", "hash-edit", "str-replace-editor"])
  const importantFilesSet = new Set<string>()
  for (const obs of observations) {
    if (fileTools.has(obs.tool_name) && obs.tool_input) {
      const path = (obs.tool_input as Record<string, unknown>).path as string | undefined
      if (path) importantFilesSet.add(path)
    }
  }

  const toolNamesUsed = [...new Set(observations.map((o) => o.tool_name).filter((t) => t !== "assistant_message"))]

  // Extract bullet points from a text block (lines starting with - or *).
  function extractBullets(text: string): string[] {
    return text
      .split("\n")
      .filter((l) => /^\s*[-*]/.test(l))
      .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
      .filter(Boolean)
  }

  // Parse the structured sections the compaction prompt produces.
  const sections: Record<string, string> = {}
  let currentSection = ""
  const currentLines: string[] = []
  for (const line of summaryText.split("\n")) {
    const header = line.match(/^##\s+\d+\.\s+(.+)/)
    if (header) {
      if (currentSection) sections[currentSection] = currentLines.join("\n").trim()
      currentSection = header[1].trim()
      currentLines.length = 0
    } else {
      currentLines.push(line)
    }
  }
  if (currentSection) sections[currentSection] = currentLines.join("\n").trim()

  const completed = extractBullets(sections["Work Completed"] ?? "")
  const pending = extractBullets(sections["Remaining Tasks"] ?? "")

  return {
    workflow_name: extractProjectFromDirectory(directory),
    current_status: "compacted",
    current_stage: null,
    completed_stages: completed,
    pending_stages: pending,
    key_decisions: [],
    blockers: [],
    important_files: [...importantFilesSet].slice(0, 30),
    approvals: [],
    open_questions: [],
    next_steps: pending.slice(0, 5),
    tool_names_used: toolNamesUsed.slice(0, 20),
    observation_count: observations.length,
    updated_at: new Date().toISOString(),
  }
}

export function onSessionCreated(directory: string, contentSessionId: string, prompt?: string): Session {
  const project = extractProjectFromDirectory(directory)
  const session = initSession(contentSessionId, project, directory)

  activeSessions.set(contentSessionId, {
    sessionId: session.id!,
    contentSessionId,
    project,
    directory,
  })

  return session
}

export function onToolExecuted(
  contentSessionId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: string | null,
  directory: string
): void {
  let ctx = activeSessions.get(contentSessionId)

  if (!ctx) {
    const project = extractProjectFromDirectory(directory)
    const session = initSession(contentSessionId, project, directory)
    ctx = {
      sessionId: session.id!,
      contentSessionId,
      project,
      directory,
    }
    activeSessions.set(contentSessionId, ctx)
  }

  try {
    storeObservation(
      ctx.sessionId,
      truncate(toolName, 200),
      toolInput,
      toolResponse ? truncate(toolResponse, MAX_TOOL_RESPONSE) : null,
      directory
    )
  } catch (err) {
    // Degrade gracefully: a failed observation write must never crash a workflow.
    // The error is already retried by executeWrite; if it still fails, warn and continue.
    console.warn(`[FlowDeck Memory] Failed to store observation for tool "${toolName}":`, err)
  }
}

export function onMessageUpdated(
  contentSessionId: string,
  role: string,
  content: string,
  directory: string
): void {
  if (role !== "assistant") return
  if (!content || !content.trim()) return

  let ctx = activeSessions.get(contentSessionId)

  if (!ctx) {
    const project = extractProjectFromDirectory(directory)
    const session = initSession(contentSessionId, project, directory)
    ctx = {
      sessionId: session.id!,
      contentSessionId,
      project,
      directory,
    }
    activeSessions.set(contentSessionId, ctx)
  }

  try {
    storeObservation(
      ctx.sessionId,
      "assistant_message",
      { role },
      truncate(content, MAX_TOOL_RESPONSE),
      directory
    )
  } catch (err) {
    console.warn("[FlowDeck Memory] Failed to store assistant message observation:", err)
  }
}

/**
 * Called when OpenCode compacts a session (session.compacted event).
 *
 * Previously this silently dropped the summary if the session was not in
 * activeSessions (e.g. after plugin reload or cross-process sessions). Now it
 * falls back to a DB lookup so the summary is never lost.
 */
export function onSessionCompact(contentSessionId: string, summary: string): void {
  // Primary: in-memory lookup (fast path for live sessions).
  let ctx = activeSessions.get(contentSessionId)

  // Fallback: look up via DB. Covers plugin restarts and cross-process sessions.
  if (!ctx) {
    const dbSession = getSessionByContentSessionId(contentSessionId)
    if (!dbSession) {
      console.warn(
        `[FlowDeck Memory] onSessionCompact: no session found for contentSessionId=${contentSessionId} — summary discarded`
      )
      return
    }
    ctx = {
      sessionId: dbSession.id!,
      contentSessionId,
      project: dbSession.project,
      directory: dbSession.directory,
    }
    activeSessions.set(contentSessionId, ctx)
  }

  const storedContent = truncate(summary, MAX_SUMMARY_STORAGE)

  try {
    const observations = getObservationsForSession(ctx.sessionId)
    const metadata = buildHandoffMetadata(ctx.sessionId, ctx.directory, summary, observations)
    storeSummary(ctx.sessionId, storedContent, metadata)
  } catch (err) {
    console.warn(`[FlowDeck Memory] Failed to store compaction summary for session ${ctx.sessionId}:`, err)
  }
}

export function onSessionEnd(contentSessionId: string, lastMessage?: string): void {
  let ctx = activeSessions.get(contentSessionId)

  // Fallback: look up via DB in case this is called without a prior onSessionCreated.
  if (!ctx) {
    const dbSession = getSessionByContentSessionId(contentSessionId)
    if (dbSession) {
      ctx = {
        sessionId: dbSession.id!,
        contentSessionId,
        project: dbSession.project,
        directory: dbSession.directory,
      }
    }
  }

  if (ctx && lastMessage && lastMessage.trim()) {
    try {
      const observations = getObservationsForSession(ctx.sessionId)
      const metadata = buildHandoffMetadata(ctx.sessionId, ctx.directory, lastMessage, observations)
      storeSummary(ctx.sessionId, truncate(lastMessage, MAX_SUMMARY_STORAGE), metadata)
    } catch (err) {
      console.warn(`[FlowDeck Memory] Failed to store end-of-session summary for session ${ctx?.sessionId}:`, err)
    }
  }

  activeSessions.delete(contentSessionId)
}

export function getSessionContext(directory: string, contentSessionId: string): {
  context: string
  previousSessions: Session[]
} {
  const context = getContextForDirectory(directory, 30)
  const previousSessions = getRecentSessions(directory, 5)
  return { context, previousSessions }
}

export function clearSession(contentSessionId: string): void {
  activeSessions.delete(contentSessionId)
}

export const memoryHook = {
  onSessionCreated,
  onToolExecuted,
  onMessageUpdated,
  onSessionCompact,
  onSessionEnd,
  getSessionContext,
  clearSession,
}