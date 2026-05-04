import {
  initSession,
  storeObservation,
  storeSummary,
  getRecentSessions,
  getObservationsForSession,
  getContextForDirectory,
  type Session,
} from "../services/memory-store"

const MAX_TOOL_RESPONSE = 10000
const MAX_PROMPT_LENGTH = 2000

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

  storeObservation(
    ctx.sessionId,
    truncate(toolName, 200),
    toolInput,
    toolResponse ? truncate(toolResponse, MAX_TOOL_RESPONSE) : null,
    directory
  )
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

  storeObservation(
    ctx.sessionId,
    "assistant_message",
    { role },
    truncate(content, MAX_TOOL_RESPONSE),
    directory
  )
}

export function onSessionCompact(contentSessionId: string, summary: string): void {
  const ctx = activeSessions.get(contentSessionId)
  if (!ctx) return

  storeSummary(ctx.sessionId, truncate(summary, MAX_PROMPT_LENGTH))
}

export function onSessionEnd(contentSessionId: string, lastMessage?: string): void {
  const ctx = activeSessions.get(contentSessionId)
  if (!ctx) return

  if (lastMessage && lastMessage.trim()) {
    storeSummary(ctx.sessionId, truncate(lastMessage, MAX_PROMPT_LENGTH))
  }

  activeSessions.delete(contentSessionId)
}

export function getSessionContext(directory: string, contentSessionId: string): {
  context: string
  previousSessions: Session[]
} {
  const context = getContextForDirectory(directory, 30)
  const previousSessions = getRecentSessions(directory, 5)

  if (previousSessions.length > 0 && activeSessions.has(contentSessionId)) {
    const ctx = activeSessions.get(contentSessionId)!
    for (const prev of previousSessions) {
      if (prev.content_session_id === contentSessionId) continue
    }
  }

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