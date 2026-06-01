import { execFile } from "child_process"

// Commands that require active user attention (they ask questions or need approval)
const INTERACTIVE_COMMANDS = new Set([
  "discuss",
  "plan",
  "deploy-check",
  "ask",
  "resume",
])

// Commands that complete a phase and should alert the user
const COMPLETION_COMMANDS = new Set([
  "new-feature",
  "fix-bug",
  "write-docs",
  "checkpoint",
  "done",
  "execute",
  "verify",
])

export type NotifyLevel = "info" | "critical"

/**
 * Structured reasons that can trigger a notification.
 * Helps consumers understand why a notification fired.
 */
export type NotificationReason =
  | "completed"
  | "input_required"
  | "confirmation_required"
  | "error"

/**
 * Normalise a raw command string to a bare command name.
 * "/fd-discuss" → "discuss", "fd-plan" → "plan", "new-feature" → "new-feature"
 */
export function normalizeCommandName(raw: string): string {
  return raw.replace(/^\//, "").replace(/^fd-/, "")
}

/**
 * Fire a desktop notification without blocking the caller.
 * Silently ignores failures — notification is best-effort only.
 */
export function notify(title: string, body: string, level: NotifyLevel = "info"): void {
  const platform = process.platform

  try {
    if (platform === "linux") {
      // notify-send (libnotify) — available on GNOME, KDE, XFCE
      const urgency = level === "critical" ? "critical" : "normal"
      const proc = execFile(
        "notify-send",
        ["--urgency", urgency, "--app-name", "FlowDeck", "--icon", "dialog-information", title, body],
        { timeout: 3000 },
      )
      proc.on("error", () => {
        // notify-send not available — no fallback that writes to stdout
      })
    } else if (platform === "darwin") {
      // osascript (macOS) — always available
      const script = `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" subtitle "FlowDeck"`
      const proc = execFile("osascript", ["-e", script], { timeout: 3000 })
      proc.on("error", () => {})
    } else if (platform === "win32") {
      // PowerShell toast notification (Windows 10+)
      const ps = [
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null",
        `$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)`,
        `$xml.GetElementsByTagName('text')[0].InnerText = '${title.replace(/'/g, "''")}' `,
        `$xml.GetElementsByTagName('text')[1].InnerText = '${body.replace(/'/g, "''")}' `,
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('FlowDeck').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`,
      ].join("; ")
      const proc = execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 5000 })
      proc.on("error", () => {})
    }
  } catch {
    // Notification failed — never throw, never affect command execution
  }
}

export type NotifyFn = (title: string, body: string, level?: NotifyLevel) => void

/**
 * Event-driven notification controller.
 *
 * Lifecycle:
 *   1. onCommandExecuted() — records that a command was dispatched (NOT yet processed)
 *   2. onSessionIdle()     — fires notification when the agent finishes processing
 *   3. onSessionError()    — fires notification on critical failure
 *
 * Deduplication: the same (command + lifecycle-state) pair is never notified twice,
 * even if session.idle fires multiple times in a row.
 *
 * @param notifyFn — injectable notify function (defaults to the real OS notifier; pass
 *                   a test stub to avoid spawning OS processes in tests).
 * @param log      — optional diagnostic logger.
 */
export class NotificationController {
  /** The command currently awaiting a session.idle notification, or null. */
  private pendingCommand: string | null = null
  /** Key of the last notification that was fired; used for deduplication. */
  private lastNotifiedKey: string | null = null
  private readonly notifyFn: NotifyFn
  private readonly log: (msg: string) => void

  constructor(notifyFn: NotifyFn = notify, log: (msg: string) => void = () => {}) {
    this.notifyFn = notifyFn
    this.log = log
  }

  /**
   * Called when the `command.executed` event fires.
   * Records the command so the next session.idle can produce the right notification.
   * Must NOT fire a notification — the command has only been dispatched, not completed.
   */
  onCommandExecuted(rawCommand: string): void {
    const name = normalizeCommandName(rawCommand)

    if (!INTERACTIVE_COMMANDS.has(name) && !COMPLETION_COMMANDS.has(name)) {
      this.log(`[notify] command.executed: "${name}" — not a tracked command, skipping`)
      return
    }

    this.log(`[notify] command.executed: "${name}" recorded as pending`)
    this.pendingCommand = name
    // Reset dedup key so the upcoming idle fires fresh even if we saw this command before
    this.lastNotifiedKey = null
  }

  /**
   * Called when the `session.idle` event fires.
   * Fires at most one notification per pending command.
   * If no command is pending, fires a generic completion notification only when
   * the agent actually edited files (hasEdits = true).
   *
   * @param hasEdits — true when the session file tracker has recorded edits this turn.
   */
  onSessionIdle(hasEdits: boolean): void {
    if (this.pendingCommand) {
      const name = this.pendingCommand
      const dedupeKey = `idle:${name}`

      if (this.lastNotifiedKey === dedupeKey) {
        this.log(`[notify] suppressed duplicate: state=session.idle command=${name}`)
        return
      }

      const reason: NotificationReason = INTERACTIVE_COMMANDS.has(name)
        ? "input_required"
        : "completed"

      this.log(
        `[notify] firing notification: reason=${reason} command=${name} source=session.idle`,
      )

      if (reason === "input_required") {
        this.notifyFn(`FlowDeck: /${name}`, "Your input is needed — please check OpenCode", "critical")
      } else {
        this.notifyFn(`FlowDeck: /${name} complete`, "Review the output and choose your next step", "info")
      }

      this.lastNotifiedKey = dedupeKey
      this.pendingCommand = null
      return
    }

    // No pending command: fall back to generic notification only when work was done
    if (hasEdits) {
      const dedupeKey = "idle:generic"
      if (this.lastNotifiedKey === dedupeKey) {
        this.log(`[notify] suppressed duplicate: state=session.idle source=generic`)
        return
      }
      this.log(`[notify] firing notification: reason=completed source=session.idle (generic, has edits)`)
      this.notifyFn("FlowDeck Task Completed", "Agent is idle and waiting for your next instruction", "info")
      this.lastNotifiedKey = dedupeKey
    } else {
      this.log(`[notify] session.idle — no pending command, no edits — suppressed`)
    }
  }

  /**
   * Called when the `session.error` event fires.
   * Always fires unless the identical error was already reported.
   */
  onSessionError(errorMsg: string): void {
    const snippet = errorMsg.slice(0, 60)
    const dedupeKey = `error:${snippet}`

    if (this.lastNotifiedKey === dedupeKey) {
      this.log(`[notify] suppressed duplicate: state=session.error`)
      return
    }

    this.log(`[notify] firing notification: reason=error source=session.error`)
    this.notifyFn("FlowDeck Error", snippet || "An error occurred", "critical")
    this.lastNotifiedKey = dedupeKey
    // Clear any pending command — the workflow is broken
    this.pendingCommand = null
  }

  /**
   * Reset all state. Useful in tests or when starting a new session.
   */
  reset(): void {
    this.pendingCommand = null
    this.lastNotifiedKey = null
  }

  // ── Accessors for testing ──────────────────────────────────────────────────

  getPendingCommand(): string | null { return this.pendingCommand }
  getLastNotifiedKey(): string | null { return this.lastNotifiedKey }
}

/**
 * Fires a notification when a permission is requested.
 * This is event-driven (permission.ask hook fires after the agent's request)
 * so it does not need to go through the NotificationController.
 */
export function notifyPermissionNeeded(tool: string): void {
  notify(
    "FlowDeck Permission Required",
    `Agent needs approval to use tool: ${tool}`,
    "critical"
  )
}

// ── Legacy exports kept for any external callers ───────────────────────────

/**
 * @deprecated Use NotificationController.onSessionIdle() instead.
 * Kept for backward compatibility — does nothing now that the controller
 * handles all session-idle notifications.
 */
export function notifySessionIdle(): void {
  // intentionally empty — replaced by NotificationController
}

/**
 * @deprecated Use NotificationController.onCommandExecuted() + onSessionIdle() instead.
 * This function fired notifications on command ENTRY (too early).
 * It is preserved as a no-op so that any lingering callers compile without error.
 */
export function notifyCommandInteraction(_command: string): void {
  // intentionally empty — replaced by NotificationController
}
