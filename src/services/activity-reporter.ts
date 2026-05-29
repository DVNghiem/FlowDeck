/**
 * Activity Reporter
 *
 * Surfaces tool lifecycle events and workflow-stage progress to the user
 * in real-time via the app logger (client.app.log → visible in the TUI/terminal).
 *
 * Design goals:
 * - Every significant tool call emits a concise user-visible log line
 * - Normal mode: short summaries (no raw dumps)
 * - Debug mode (FLOWDECK_DEBUG=true): full inputs/outputs + trace metadata
 * - Retries, fallbacks, cache hits, and skips are all individually logged
 * - Workflow-stage transitions are visible
 */

/** Max chars shown for a summary field in normal mode */
const SUMMARY_MAX_NORMAL = 120
/** Max chars shown for a summary field in debug mode */
const SUMMARY_MAX_DEBUG = 600

export function isDebugMode(): boolean {
  return process.env.FLOWDECK_DEBUG === "true" || process.env.FLOWDECK_DEBUG === "1"
}

/** Trim text to maxLen, appending ellipsis when truncated */
export function summarize(text: string, maxLen = SUMMARY_MAX_NORMAL): string {
  if (!text) return ""
  const s = text.trim().replace(/\s+/g, " ")
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + "…"
}

/** Format milliseconds as human-readable "42ms" or "3.2s" */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export interface ActivityMeta {
  session_id?: string
  run_id?: string
  command?: string
  stage?: string
  agent?: string
  retry_count?: number
  workflow_id?: string
  tool?: string
}

export class ActivityReporter {
  private readonly log: (msg: string) => void
  /** correlationKey → start epoch ms */
  private readonly startTimes = new Map<string, number>()

  constructor(log: (msg: string) => void) {
    this.log = log
  }

  private emit(msg: string): void {
    try {
      this.log(msg)
    } catch {
      // Best-effort — a logging failure must never block workflow execution
    }
  }

  // ── Timing helpers ───────────────────────────────────────────────────────

  /** Record start time against a correlation key. */
  trackStart(key: string): void {
    this.startTimes.set(key, Date.now())
  }

  /**
   * Consume the start time for key and return elapsed ms.
   * Returns undefined if key was never tracked.
   */
  elapsedMs(key: string): number | undefined {
    const t = this.startTimes.get(key)
    if (t === undefined) return undefined
    this.startTimes.delete(key)
    return Date.now() - t
  }

  // ── Lifecycle events ─────────────────────────────────────────────────────

  /** Emitted when a tool call begins. */
  reportToolStarted(tool: string, inputSummary: string, meta: ActivityMeta = {}): void {
    const maxLen = isDebugMode() ? SUMMARY_MAX_DEBUG : SUMMARY_MAX_NORMAL
    const parts: string[] = [`[→ ${tool}]`]
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    if (inputSummary) parts.push(summarize(inputSummary, maxLen))
    if (isDebugMode()) {
      if (meta.session_id) parts.push(`session=${meta.session_id}`)
      if (meta.stage) parts.push(`stage=${meta.stage}`)
      if (meta.run_id) parts.push(`run=${meta.run_id}`)
    }
    this.emit(parts.join(" "))
  }

  /** Emitted when a tool call completes successfully. */
  reportToolCompleted(
    tool: string,
    durationMs: number | undefined,
    resultSummary: string,
    meta: ActivityMeta = {},
  ): void {
    const maxLen = isDebugMode() ? SUMMARY_MAX_DEBUG : SUMMARY_MAX_NORMAL
    const dur = durationMs !== undefined ? ` (${fmtDuration(durationMs)})` : ""
    const parts: string[] = [`[✓ ${tool}]${dur}`]
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    if (resultSummary) parts.push(summarize(resultSummary, maxLen))
    if (isDebugMode() && meta.retry_count && meta.retry_count > 0) {
      parts.push(`retries=${meta.retry_count}`)
    }
    this.emit(parts.join(" "))
  }

  /** Emitted when a tool call fails (after all retries are exhausted). */
  reportToolFailed(
    tool: string,
    durationMs: number | undefined,
    error: string,
    meta: ActivityMeta = {},
  ): void {
    const dur = durationMs !== undefined ? ` (${fmtDuration(durationMs)})` : ""
    const parts: string[] = [`[✗ ${tool}]${dur}`]
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    parts.push(`error=${summarize(error, isDebugMode() ? SUMMARY_MAX_DEBUG : 200)}`)
    if (isDebugMode() && meta.retry_count && meta.retry_count > 0) {
      parts.push(`retries=${meta.retry_count}`)
    }
    this.emit(parts.join(" "))
  }

  /** Emitted each time a tool call is retried. */
  reportToolRetried(tool: string, attempt: number, reason: string, meta: ActivityMeta = {}): void {
    const parts: string[] = [`[↺ ${tool}] retry attempt=${attempt}`]
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    if (reason) parts.push(`reason=${summarize(reason, 80)}`)
    this.emit(parts.join(" "))
  }

  /** Emitted when the system falls back from one tool/strategy to another. */
  reportToolFallback(fromTool: string, toTool: string, reason: string, meta: ActivityMeta = {}): void {
    const parts: string[] = [`[⇢ fallback] ${fromTool} → ${toTool}`]
    if (reason) parts.push(`reason=${summarize(reason, 80)}`)
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    this.emit(parts.join(" "))
  }

  /** Emitted when a tool call is satisfied from the prompt cache. */
  reportCacheHit(tool: string, agent: string, meta: ActivityMeta = {}): void {
    const parts: string[] = [`[≡ ${tool}] cache hit agent=${agent}`]
    if (isDebugMode() && meta.session_id) parts.push(`session=${meta.session_id}`)
    this.emit(parts.join(" "))
  }

  /** Emitted when a tool or step is intentionally skipped. */
  reportSkipped(tool: string, reason: string, meta: ActivityMeta = {}): void {
    const parts: string[] = [`[⊘ ${tool}] skipped`]
    if (reason) parts.push(`reason=${summarize(reason, 80)}`)
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    this.emit(parts.join(" "))
  }

  // ── Workflow stage progress ───────────────────────────────────────────────

  /**
   * Report high-level workflow stage transitions so users can see
   * which phase of a long-running workflow is currently active.
   *
   * Examples:
   *   reporter.reportStageProgress("research", "started")
   *   reporter.reportStageProgress("plan", "complete", "3 phases generated")
   *   reporter.reportStageProgress("execute", "running", "step 2 of 5")
   */
  reportStageProgress(
    stage: string,
    status: "started" | "running" | "complete" | "failed" | "waiting",
    detail?: string,
    meta: ActivityMeta = {},
  ): void {
    const icon: Record<string, string> = {
      started: "▶",
      running: "⋯",
      complete: "●",
      failed: "✗",
      waiting: "⌛",
    }
    const sym = icon[status] ?? "·"
    const parts: string[] = [`[${sym} ${stage}] ${status}`]
    if (detail) parts.push(summarize(detail))
    if (isDebugMode() && meta.workflow_id) parts.push(`workflow=${meta.workflow_id}`)
    this.emit(parts.join(" "))
  }
}
