/**
 * Telemetry Hook
 * Emits structured telemetry events for all tool calls to TELEMETRY.jsonl.
 * Also surfaces concise user-visible log lines via an optional ActivityReporter,
 * so the user can see what the agent is doing in real-time.
 *
 * Duration tracking: telemetryHook (before) records the start time keyed on
 * "${session_id}:${run_id}:${tool}". telemetryAfterHook (after) reads the
 * elapsed time and includes it in both the telemetry event and the visible log.
 */
import { appendEvent } from "../services/telemetry"
import type { ActivityReporter } from "../services/activity-reporter"
import { summarize } from "../services/activity-reporter"

/** Module-level start-time map shared between before and after hook calls */
const toolStartTimes = new Map<string, number>()

/** Interesting tools to report in the user-visible activity feed */
const REPORTABLE_TOOLS = new Set([
  "delegate", "run-pipeline", "council",
  "bash", "write", "edit", "read",
  "codegraph", "codebase-state", "planning-state", "workspace-state",
  "repo-memory", "hash-edit", "context-generator",
  "volatility-map", "failure-replay", "decision-trace",
  "policy-engine", "reflect",
])

function correlationKey(sessionId: string, runId: string, tool: string): string {
  return `${sessionId}:${runId}:${tool}`
}

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

/** Build a short summary of tool arguments for display */
function buildInputSummary(tool: string, args: Record<string, unknown>): string {
  if (tool === "delegate" || tool === "run-pipeline" || tool === "council") {
    // Delegate/pipeline have their own richer lifecycle logging in the tool itself
    return ""
  }
  if (tool === "bash" || tool === "write" || tool === "edit" || tool === "read") {
    const path = (args.path ?? args.filePath ?? args.file ?? "") as string
    const cmd = (args.command ?? args.cmd ?? "") as string
    return path || cmd ? summarize(String(path || cmd), 80) : ""
  }
  // Generic: show first string arg value
  const firstStr = Object.values(args).find(v => typeof v === "string") as string | undefined
  return firstStr ? summarize(firstStr, 80) : ""
}

export async function telemetryHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string; sessionID?: string; sessionId?: string; messageID?: string; messageId?: string; runID?: string; runId?: string },
  output: { args?: Record<string, unknown> },
  reporter?: ActivityReporter,
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"
  const ids = resolveIds(toolInput as Record<string, unknown>)
  const key = correlationKey(ids.session_id, ids.run_id, tool)

  // Track start time for duration calculation in the after-hook
  toolStartTimes.set(key, Date.now())

  appendEvent(dir, {
    session_id: ids.session_id,
    run_id: ids.run_id,
    event: "tool.call",
    tool,
    status: "ok",
    meta: { parameters: output.args ?? {} },
  })

  // Emit user-visible activity for significant tools
  if (reporter && REPORTABLE_TOOLS.has(tool)) {
    const inputSummary = buildInputSummary(tool, output.args ?? {})
    reporter.reportToolStarted(tool, inputSummary, {
      session_id: ids.session_id,
      run_id: ids.run_id,
    })
  }
}

export async function telemetryAfterHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string; sessionID?: string; sessionId?: string; messageID?: string; messageId?: string; runID?: string; runId?: string },
  output: { title?: string; output?: string; metadata?: unknown; error?: unknown },
  reporter?: ActivityReporter,
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"
  const ids = resolveIds(toolInput as Record<string, unknown>)
  const key = correlationKey(ids.session_id, ids.run_id, tool)
  const status = inferStatus(output)

  // Calculate duration from tracked start time
  const startMs = toolStartTimes.get(key)
  const duration_ms = startMs !== undefined ? Date.now() - startMs : undefined
  toolStartTimes.delete(key)

  // Extract short result summary
  let result_summary: string | undefined
  if (typeof output.output === "string") {
    result_summary = summarize(output.output, 100)
  } else if (output.error) {
    result_summary = summarize(String(output.error), 100)
  }

  appendEvent(dir, {
    session_id: ids.session_id,
    run_id: ids.run_id,
    event: status === "error" ? "tool.failed" : "tool.complete",
    tool,
    status,
    duration_ms,
    result_summary,
  })

  // Emit user-visible activity for significant tools (skip delegate/pipeline — they log internally)
  const selfLogging = new Set(["delegate", "run-pipeline", "council"])
  if (reporter && REPORTABLE_TOOLS.has(tool) && !selfLogging.has(tool)) {
    if (status === "error") {
      const errText = output.error
        ? String(output.error)
        : (typeof output.output === "string" ? output.output : "unknown error")
      reporter.reportToolFailed(tool, duration_ms, errText)
    } else {
      reporter.reportToolCompleted(tool, duration_ms, result_summary ?? "")
    }
  }
}

