import { logEvent, getCurrentAgent, setCurrentAgent, sanitizeArgs, type ToolEvent } from "@/services/event-logger"

type AppLog = (msg: string) => void

const toolStartTimes = new Map<string, number>()

let staleThresholdMs = 5 * 60 * 1000 // 5 minutes for production
const CLEANUP_INTERVAL = 50 // Clean up every 50 before hooks

let beforeHookCallCount = 0

export function setStaleThresholdMs(ms: number): void {
  staleThresholdMs = ms
}

export function cleanupStaleToolStartTimes(): void {
  const now = Date.now()
  for (const [key, startTime] of toolStartTimes.entries()) {
    if (now - startTime > staleThresholdMs) {
      toolStartTimes.delete(key)
    }
  }
}

/**
 * Create event log hooks wired to the OpenCode TUI via client.app.log.
 * All tool and session events are persisted to .opencode/flowdeck-events.jsonl
 * AND displayed in the TUI's bounded log panel through the provided appLog fn.
 */
export function createEventLogHooks(appLog: AppLog) {
  return {
    async before(ctx: { directory: string }, toolInput: any, toolOutput: any): Promise<void> {
      const toolName = toolInput.tool ?? toolInput.name ?? "unknown"
      const sessionId = toolInput.sessionID ?? toolInput.sessionId ?? "unknown"
      const args = toolOutput?.args ?? toolInput?.args ?? {}

      const startKey = `${sessionId}:${toolName}`

      beforeHookCallCount++
      if (beforeHookCallCount >= CLEANUP_INTERVAL) {
        beforeHookCallCount = 0
        cleanupStaleToolStartTimes()
      }

      toolStartTimes.set(startKey, Date.now())

      const event: ToolEvent = {
        timestamp: new Date().toISOString(),
        type: "tool.before",
        agent: getCurrentAgent() ?? undefined,
        tool: toolName,
        args: sanitizeArgs(args),
        session_id: sessionId,
      }

      logEvent(ctx.directory, event, appLog)
    },

    async after(ctx: { directory: string }, toolInput: any, toolOutput: any): Promise<void> {
      const toolName = toolInput.tool ?? toolInput.name ?? "unknown"
      const sessionId = toolInput.sessionID ?? toolInput.sessionId ?? "unknown"
      const args = toolOutput?.args ?? toolInput?.args ?? {}

      const startKey = `${sessionId}:${toolName}`
      const startTime = toolStartTimes.get(startKey)
      const durationMs = startTime ? Date.now() - startTime : undefined
      toolStartTimes.delete(startKey)

      let status: ToolEvent["status"] = "success"
      let error: string | undefined

      if (toolOutput?.error != null) {
        status = "error"
        error = typeof toolOutput.error === "string" ? toolOutput.error : String(toolOutput.error)
      } else if (toolOutput?.status === "error") {
        status = "error"
        error = typeof toolOutput.error === "string" ? toolOutput.error : "Unknown error"
      } else if (toolOutput?.status === "blocked") {
        status = "blocked"
      }

      const event: ToolEvent = {
        timestamp: new Date().toISOString(),
        type: "tool.after",
        agent: getCurrentAgent() ?? undefined,
        tool: toolName,
        args: sanitizeArgs(args),
        duration_ms: durationMs,
        status,
        error,
        session_id: sessionId,
      }

      logEvent(ctx.directory, event, appLog)
    },

    async session(ctx: { directory: string }, event: any): Promise<void> {
      const type: string = event?.type ?? ""
      const props = event?.properties ?? {}

      if (type === "session.created") {
        if (props.parentID) {
          const agentName = extractAgentFromEvent(props)
          setCurrentAgent(agentName)
        }

        const toolEvent: ToolEvent = {
          timestamp: new Date().toISOString(),
          type: "session.created",
          session_id: props.id ?? props.sessionId ?? undefined,
        }
        logEvent(ctx.directory, toolEvent, appLog)
      } else if (type === "session.idle") {
        if (props.parentID) {
          setCurrentAgent(null)
        }

        const toolEvent: ToolEvent = {
          timestamp: new Date().toISOString(),
          type: "session.idle",
          session_id: props.id ?? props.sessionId ?? undefined,
        }
        logEvent(ctx.directory, toolEvent, appLog)
      } else if (type === "session.error") {
        if (props.parentID) {
          setCurrentAgent(null)
        }
        const err = props.error
        const errorMsg =
          (err && typeof err === "object" && "message" in err ? String(err.message) : undefined) ??
          (typeof err === "string" ? err : undefined) ??
          undefined

        const toolEvent: ToolEvent = {
          timestamp: new Date().toISOString(),
          type: "session.error",
          session_id: props.id ?? props.sessionId ?? undefined,
          error: errorMsg,
        }
        logEvent(ctx.directory, toolEvent, appLog)
      }
    },
  }
}

// Legacy named exports kept for existing tests and any external callers.
export async function eventLogBeforeHook(
  ctx: { directory: string },
  toolInput: any,
  toolOutput: any
): Promise<void> {
  return createEventLogHooks(() => {}).before(ctx, toolInput, toolOutput)
}

export async function eventLogAfterHook(
  ctx: { directory: string },
  toolInput: any,
  toolOutput: any
): Promise<void> {
  return createEventLogHooks(() => {}).after(ctx, toolInput, toolOutput)
}

export async function eventLogSessionHook(
  ctx: { directory: string },
  event: any
): Promise<void> {
  return createEventLogHooks(() => {}).session(ctx, event)
}

function extractAgentFromEvent(props: Record<string, unknown>): string {
  if (typeof props.agent === "string") return props.agent
  if (typeof props.name === "string") return props.name

  const title = typeof props.title === "string" ? props.title : ""
  const match = title.match(/^(.+)-delegate$/)
  if (match) return match[1]

  return "unknown"
}
