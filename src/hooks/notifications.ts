import { execFile } from "child_process"

// Commands that require active user attention (they ask questions or need approval)
const INTERACTIVE_COMMANDS = new Set([
  "discuss",
  "plan",
  "review-code",
  "deploy-check",
])

// Commands that complete a phase and should alert the user
const COMPLETION_COMMANDS = new Set([
  "new-feature",
  "fix-bug",
  "write-docs",
  "checkpoint",
])

type NotifyLevel = "info" | "critical"

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
        // notify-send not available — try fallback
        tryTerminalBell()
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

function tryTerminalBell(): void {
  try {
    process.stdout.write("\x07") // BEL character
  } catch {
    // ignore
  }
}

/**
 * Fires a notification when a command that needs user interaction starts.
 * Call this from command.execute.before after the command result is generated.
 */
export function notifyCommandInteraction(command: string): void {
  // Strip leading slash and optional "fd-" prefix: "/fd-discuss" → "discuss"
  const name = command.replace(/^\//, "").replace(/^fd-/, "")

  if (INTERACTIVE_COMMANDS.has(name)) {
    notify(
      `FlowDeck: /${name}`,
      "Your input is needed — please check OpenCode",
      "critical",
    )
  } else if (COMPLETION_COMMANDS.has(name)) {
    notify(
      `FlowDeck: /${name} complete`,
      "Review the output and choose your next step",
      "info",
    )
  }
}

/**
 * Fires a notification when the session becomes idle (task complete).
 */
export function notifySessionIdle(): void {
  notify(
    "FlowDeck Task Completed",
    "Agent is idle and waiting for your next instruction",
    "info"
  )
}

/**
 * Fires a notification when a permission is requested.
 */
export function notifyPermissionNeeded(tool: string): void {
  notify(
    "FlowDeck Permission Required",
    `Agent needs approval to use tool: ${tool}`,
    "critical"
  )
}
