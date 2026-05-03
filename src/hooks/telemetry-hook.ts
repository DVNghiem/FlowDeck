/**
 * Telemetry Hook
 * Emits structured telemetry events for all tool calls to TELEMETRY.jsonl.
 * Enables the AgentOps dashboard to show tool usage, latency, and failures.
 */
import { appendEvent } from "../services/telemetry"

export async function telemetryHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string },
  output: { args?: Record<string, unknown> }
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"

  appendEvent(dir, {
    session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
    run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
    event: "tool.call",
    tool,
    status: "ok",
    meta: { parameters: output.args ?? {} },
  })
}

export async function telemetryAfterHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string },
  _output: { title?: string; output?: string; metadata?: unknown }
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"

  appendEvent(dir, {
    session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
    run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
    event: "tool.complete",
    tool,
    status: "ok",
  })
}
