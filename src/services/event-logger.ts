import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from "fs"
import { join, resolve, sep } from "path"

export interface ToolEvent {
  timestamp: string
  type: "tool.before" | "tool.after" | "session.created" | "session.idle" | "session.error"
  agent?: string
  tool?: string
  args?: Record<string, unknown>
  thinking?: string
  duration_ms?: number
  status?: "success" | "error" | "blocked"
  error?: string
  session_id?: string
}

const SENSITIVE_KEYS = [
  "password", "token", "apikey", "api_key", "secret", "authorization", "auth",
  "key", "credential", "privatekey", "private_key", "accesstoken", "access_token",
  "refreshtoken", "refresh_token"
]

let currentAgent: string | null = null
let persistenceFailed = false
let lastPersistenceError: string | null = null

export function getCurrentAgent(): string | null {
  return currentAgent
}

export function setCurrentAgent(agent: string | null): void {
  currentAgent = agent
}

export function isEventLogHealthy(): boolean {
  return !persistenceFailed
}

export function getLastPersistenceError(): string | null {
  return lastPersistenceError
}

export function resetEventLogHealth(): void {
  persistenceFailed = false
  lastPersistenceError = null
}

export function sanitizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {}

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
      result[key] = "[REDACTED]"
    } else if (key === "content" || key === "newString" || key === "oldString" || key === "template") {
      if (typeof value === "string" && value.length > 100) {
        result[key] = `[${value.length} chars truncated]`
      } else {
        result[key] = value
      }
    } else {
      result[key] = value
    }
  }
  return result
}

function isValidDirectory(directory: string): boolean {
  const normalized = resolve(directory)
  if (normalized !== directory && !directory.startsWith(sep)) {
    return false
  }
  if (directory.includes("..") || directory.includes(".." + sep)) {
    return false
  }
  try {
    const stats = statSync(directory)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export function logEvent(directory: string, event: ToolEvent, log?: (msg: string) => void): boolean {
  if (process.env.FLOWDECK_EVENT_LOG === "off") return true
  if (!isValidDirectory(directory)) {
    persistenceFailed = true
    lastPersistenceError = "Invalid directory"
    return false
  }

  const logDir = join(directory, ".opencode")
  const logPath = join(logDir, "flowdeck-events.jsonl")

  try {
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    appendFileSync(logPath, JSON.stringify(event) + "\n", "utf-8")
    rotateLogFile(logPath, log)

    if (log) {
      log(formatEventForStderr(event))
    }
    return true
  } catch (error) {
    persistenceFailed = true
    lastPersistenceError = error instanceof Error ? error.message : String(error)
    if (log) {
      log(`[event-logger] failed to write event: ${lastPersistenceError}`)
    }
    return false
  }
}

function rotateLogFile(logPath: string, log?: (msg: string) => void): void {
  try {
    const stats = statSync(logPath)
    if (stats.size < 5000) return

    const content = readFileSync(logPath, "utf-8")
    const lines = content.split("\n").filter((l) => l.trim())
    if (lines.length > 1000) {
      const backupPath = logPath + ".backup"
      renameSync(logPath, backupPath)
      const keep = lines.slice(-1000)
      writeFileSync(logPath, keep.join("\n") + "\n", "utf-8")
      try { unlinkSync(backupPath) } catch { /* ignore */ }
    }
  } catch (error) {
    if (log) {
      const message = error instanceof Error ? error.message : String(error)
      log(`[event-logger] log rotation failed: ${message}`)
    }
  }
}

export function formatEventForStderr(event: ToolEvent): string {
  const time = event.timestamp.slice(11, 23)
  const agent = event.agent ?? "unknown"
  const dim = "\x1b[2m"
  const reset = "\x1b[0m"
  const cyan = "\x1b[36m"

  switch (event.type) {
    case "tool.before": {
      let icon: string
      if (event.tool === "write" || event.tool === "edit") icon = "✏️ "
      else if (event.tool === "read") icon = "🔍"
      else if (event.tool === "bash" || event.tool === "shell") icon = "🏃"
      else icon = "🔧"
      const argStr = formatArgs(event.args)
      const thinking = event.thinking ? ` "${event.thinking}"` : ""
      return `${dim}[${time}]${reset} ${icon} ${cyan}${agent}${reset}  → ${event.tool}(${argStr})${thinking}`
    }

    case "tool.after": {
      let icon: string
      let statusColor: string
      if (event.status === "success") {
        icon = "✅"
        statusColor = "\x1b[32m"
      } else if (event.status === "error") {
        icon = "❌"
        statusColor = "\x1b[31m"
      } else if (event.status === "blocked") {
        icon = "⛔"
        statusColor = "\x1b[33m"
      } else {
        icon = "✅"
        statusColor = "\x1b[32m"
      }
      const argStr = formatArgs(event.args)
      const duration = event.duration_ms ? ` done in ${event.duration_ms}ms` : ""
      const error = event.error ? ` error: ${event.error}` : ""
      return `${dim}[${time}]${reset} ${icon} ${cyan}${agent}${reset}  → ${event.tool}(${argStr})${statusColor}${duration}${error}${reset}`
    }

    case "session.created":
      return `${dim}[${time}]${reset} 📂 session created${event.session_id ? ` (${event.session_id})` : ""}`

    case "session.idle":
      return `${dim}[${time}]${reset} 💤 session idle${event.session_id ? ` (${event.session_id})` : ""}`

    case "session.error":
      return `${dim}[${time}]${reset} ❌ session error${event.error ? `: ${event.error}` : ""}`

    default:
      return `${dim}[${time}]${reset} ${event.type}`
  }
}

function formatArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return ""
  const parts: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (key === "filePath" || key === "path" || key === "file") {
      parts.push(String(value))
    } else if (key === "agent") {
      parts.push(`@${String(value)}`)
    }
  }
  return parts.join(", ")
}
