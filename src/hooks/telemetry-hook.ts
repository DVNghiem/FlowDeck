/**
 * Telemetry Hook
 * Emits structured telemetry events for all tool calls to TELEMETRY.jsonl.
 * Enables the AgentOps dashboard to show tool usage, latency, and failures.
 */
import { appendEvent } from "../services/telemetry"

function resolveIds(toolInput: Record<string, unknown>): { session_id: string; run_id: string } {
  const session_id =
    (toolInput.sessionID as string | undefined) ??
    (toolInput.sessionId as string | undefined) ??
    process.env.OPENCODE_SESSION_ID ??
    "session-0"
  const run_id =
    (toolInput.messageID as string | undefined) ??
    (toolInput.messageId as string | undefined) ??
    (toolInput.runID as string | undefined) ??
    (toolInput.runId as string | undefined) ??
    process.env.OPENCODE_RUN_ID ??
    "run-0"

  return { session_id, run_id }
}

function inferStatus(output: { title?: string; output?: string; metadata?: unknown; error?: unknown }): "ok" | "error" {
  if (output.error) return "error"
  if (typeof output.output !== "string") return "ok"
  const text = output.output.trim()
  if (!text) return "ok"
  try {
    const parsed = JSON.parse(text) as { success?: boolean; error?: unknown; status?: string }
    if (parsed.success === false || parsed.error || parsed.status === "error") return "error"
    return "ok"
  } catch {
    return "ok"
  }
}

export async function telemetryHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string; sessionID?: string; sessionId?: string; messageID?: string; messageId?: string; runID?: string; runId?: string },
  output: { args?: Record<string, unknown> }
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"
  const ids = resolveIds(toolInput as Record<string, unknown>)

  appendEvent(dir, {
    session_id: ids.session_id,
    run_id: ids.run_id,
    event: "tool.call",
    tool,
    status: "ok",
    meta: { parameters: output.args ?? {} },
  })
}

export async function telemetryAfterHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string; sessionID?: string; sessionId?: string; messageID?: string; messageId?: string; runID?: string; runId?: string },
  output: { title?: string; output?: string; metadata?: unknown; error?: unknown }
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"
  const ids = resolveIds(toolInput as Record<string, unknown>)
  const status = inferStatus(output)

  appendEvent(dir, {
    session_id: ids.session_id,
    run_id: ids.run_id,
    event: "tool.complete",
    tool,
    status,
  })
}
