import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"

const LOG_DIR = ".opencode"
const LOG_FILE = "flowdeck.log"

export interface LogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "block"
  source: string
  message: string
}

/**
 * Get the log file path for a given directory.
 */
export function logPath(directory: string): string {
  return join(directory, LOG_DIR, LOG_FILE)
}

/**
 * Ensure the log directory exists.
 */
function ensureLogDir(logDir: string): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
}

/**
 * Write a log entry to .opencode/flowdeck.log
 * Does NOT write to stdout - avoids overwriting OpenCode input box.
 */
export function logWrite(
  directory: string,
  level: LogEntry["level"],
  source: string,
  message: string
): void {
  const logDir = join(directory, LOG_DIR)
  const logFile = join(logDir, LOG_FILE)

  try {
    ensureLogDir(logDir)
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    }
    appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    // Silently fail - logging should not crash the app
  }
}

/**
 * Read recent log entries from .opencode/flowdeck.log
 */
export function logRead(directory: string, maxEntries = 50): LogEntry[] {
  const logFile = join(directory, LOG_DIR, LOG_FILE)
  const entries: LogEntry[] = []

  try {
    if (!existsSync(logFile)) {
      return entries
    }
    const content = require("fs").readFileSync(logFile, "utf-8")
    const lines = content.split("\n").filter((l: string) => l.trim())
    const recent = lines.slice(-maxEntries)
    for (const line of recent) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Return empty array on error
  }

  return entries
}