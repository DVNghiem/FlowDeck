/**
 * Activity Reporter
 *
 * Surfaces tool lifecycle events and workflow-stage progress to the user
 * in real-time via two channels:
 *   1. appLog (client.app.log) — persistent server log visible in the log panel
 *   2. toast (client.tui.showToast) — ephemeral in-TUI notifications for key events
 *
 * Design goals:
 * - Every significant tool call emits a concise user-visible log line
 * - Key events (failures, stage transitions, waiting states) also show TUI toasts
 * - Heartbeat toast fires if a tracked tool runs > HEARTBEAT_INTERVAL_MS
 * - Normal mode: short summaries (no raw dumps)
 * - Debug mode (FLOWDECK_DEBUG=true): full inputs/outputs + trace metadata
 * - Retries, fallbacks, cache hits, and skips are all individually logged
 */

/** Max chars shown for a summary field in normal mode */
const SUMMARY_MAX_NORMAL = 120
/** Max chars shown for a summary field in debug mode */
const SUMMARY_MAX_DEBUG = 600

/** Interval before the first "still running" heartbeat toast (ms) */
export const HEARTBEAT_INTERVAL_MS = 15_000

/** Tools that warrant a TUI toast when they start (high-signal delegation events) */
const TOAST_ON_START_TOOLS = new Set(["delegate", "run-pipeline"])

export type ToastVariant = "info" | "success" | "warning" | "error"
/** Injectable toast function — wraps client.tui.showToast in production. */
export type ToastFn = (msg: string, variant: ToastVariant, duration?: number) => void

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

/** Strip leading slash and fd- prefix to get a bare command name. */
function normalizeCommandName(raw: string): string {
  return raw.replace(/^\//, "").replace(/^fd-/, "")
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
  private readonly toastFn?: ToastFn
  /** correlationKey → start epoch ms */
  private readonly startTimes = new Map<string, number>()
  /** correlationKey → heartbeat interval handle */
  private readonly heartbeats = new Map<string, ReturnType<typeof setInterval>>()

  constructor(log: (msg: string) => void, toast?: ToastFn) {
    this.log = log
    this.toastFn = toast
  }

  private emit(msg: string): void {
    try {
      this.log(msg)
    } catch {
      // Best-effort — a logging failure must never block workflow execution
    }
  }

  /** Send an ephemeral toast to the TUI. Duration is in milliseconds. */
  private toastNow(msg: string, variant: ToastVariant, duration?: number): void {
    if (!this.toastFn) return
    try {
      this.toastFn(msg, variant, duration)
    } catch {
      // Best-effort — a toast failure must never block workflow execution
    }
  }

  // ── Timing helpers ───────────────────────────────────────────────────────

  /**
   * Record start time against a correlation key and start a heartbeat interval.
   * If the tracked operation hasn't finished within HEARTBEAT_INTERVAL_MS, a
   * "still running" log line and toast are emitted to prevent the TUI from
   * looking frozen during long-running tools.
   */
  trackStart(key: string): void {
    this.startTimes.set(key, Date.now())
    const toolName = key.split(":").pop() ?? key
    const interval = setInterval(() => {
      const startMs = this.startTimes.get(key)
      if (startMs === undefined) return
      const elapsed = Date.now() - startMs
      const msg = `[⋯ ${toolName}] still running (${fmtDuration(elapsed)})`
      this.emit(msg)
      this.toastNow(msg, "info", 8000)
    }, HEARTBEAT_INTERVAL_MS)
    // Avoid keeping the process alive for a heartbeat timer
    if (typeof (interval as unknown as { unref?: () => void }).unref === "function") {
      (interval as unknown as { unref: () => void }).unref()
    }
    this.heartbeats.set(key, interval)
  }

  /**
   * Consume the start time for key, cancel its heartbeat, and return elapsed ms.
   * Returns undefined if key was never tracked.
   */
  elapsedMs(key: string): number | undefined {
    const interval = this.heartbeats.get(key)
    if (interval !== undefined) {
      clearInterval(interval)
      this.heartbeats.delete(key)
    }
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
    // Toast only for high-signal delegation events to avoid TUI noise
    if (TOAST_ON_START_TOOLS.has(tool)) {
      const agentPart = meta.agent ? ` @${meta.agent}` : ""
      const inputPart = inputSummary ? `: ${summarize(inputSummary, 60)}` : ""
      this.toastNow(`→ ${tool}${agentPart}${inputPart}`, "info", 3000)
    }
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
    this.toastNow(
      `✗ ${tool}${dur}: ${summarize(error, 80)}`,
      "error",
      8000,
    )
  }

  /** Emitted each time a tool call is retried. */
  reportToolRetried(tool: string, attempt: number, reason: string, meta: ActivityMeta = {}): void {
    const parts: string[] = [`[↺ ${tool}] retry attempt=${attempt}`]
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    if (reason) parts.push(`reason=${summarize(reason, 80)}`)
    this.emit(parts.join(" "))
    this.toastNow(`↺ ${tool} retry #${attempt}${meta.agent ? ` @${meta.agent}` : ""}`, "warning", 5000)
  }

  /** Emitted when the system falls back from one tool/strategy to another. */
  reportToolFallback(fromTool: string, toTool: string, reason: string, meta: ActivityMeta = {}): void {
    const parts: string[] = [`[⇢ fallback] ${fromTool} → ${toTool}`]
    if (reason) parts.push(`reason=${summarize(reason, 80)}`)
    if (meta.agent) parts.push(`agent=${meta.agent}`)
    this.emit(parts.join(" "))
    this.toastNow(`⇢ fallback: ${fromTool} → ${toTool}`, "info", 4000)
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
   * Key status values (started/complete/failed/waiting) also emit TUI toasts.
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

    const detailPart = detail ? `: ${summarize(detail, 60)}` : ""
    switch (status) {
      case "started":
        this.toastNow(`▶ ${stage} started${detailPart}`, "info", 3000)
        break
      case "complete":
        this.toastNow(`● ${stage} complete${detailPart}`, "success", 4000)
        break
      case "failed":
        this.toastNow(`✗ ${stage} failed${detailPart}`, "error", 8000)
        break
      case "waiting":
        // Long duration — requires user action
        this.toastNow(`⌛ ${stage}: waiting for input${detailPart}`, "warning", 30000)
        break
    }
  }

  // ── TUI-specific activity events ─────────────────────────────────────────

  /**
   * Emitted when the permission.ask hook fires — the system is blocked
   * on user approval. Shows a prominent warning toast.
   */
  reportWaitingForApproval(tool: string, _meta: ActivityMeta = {}): void {
    const msg = `⌛ Approval required: ${tool}`
    this.emit(msg)
    this.toastNow(msg, "warning", 30000)
  }

  /**
   * Emitted when a user command begins execution.
   * Shows a brief info toast so the user knows the system heard them.
   */
  reportCommandStarted(command: string): void {
    const cmd = normalizeCommandName(command)
    const msg = `▶ /${cmd} started`
    this.emit(msg)
    this.toastNow(msg, "info", 2500)
  }

  /**
   * Emitted when a user command completes (session.idle fires after it).
   * Shows a success toast with a note about file modifications.
   */
  reportCommandCompleted(command: string, hasEdits: boolean): void {
    const cmd = normalizeCommandName(command)
    const detail = hasEdits ? " (files modified)" : ""
    const msg = `● /${cmd} complete${detail}`
    this.emit(msg)
    this.toastNow(msg, "success", 5000)
  }
}
