import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "fs"
import { basename, join } from "path"
import { statePath, parseState, planningDir, checkpointPath } from "../tools/planning-state-lib"
import { clearWriteCounter } from "./tool-guard"

const LOG_DIR = ".opencode"
const LOG_FILE = "flowdeck.log"

/**
 * HOOK-02: Idle and error session notifications
 * Writes JSON Lines entries to .opencode/flowdeck.log, and on idle refreshes
 * `~/.fd-plan/<slug>/checkpoint.json` so an interrupted session stays resumable.
 */
export async function sessionEventsHook(
  ctx: { directory: string },
  eventType: "idle" | "error",
  sessionID: string,
): Promise<void> {
  const logDir = join(ctx.directory, LOG_DIR)
  const logPath = join(logDir, LOG_FILE)

  // Ensure log directory exists
  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true })
    } catch (err) {
      throw new Error(`[flowdeck] ERROR: Could not create log directory: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  clearWriteCounter(sessionID)

  if (eventType === "idle") {
    saveCheckpoint(ctx.directory)
  }

  const phase = getPhase(ctx.directory)
  const timestamp = new Date().toISOString()
  const detail =
    eventType === "idle"
      ? "Session is idle. State checkpointed — resume with /fd-resume."
      : "Session encountered an error."

  // Write JSON Lines entry to .opencode/flowdeck.log (log only, no stdout to avoid overwriting OpenCode input box)
  const entry = { timestamp, event: eventType, phase, detail }
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8")
}

/**
 * Refresh `checkpoint.json` on idle.
 *
 * Commands write the meaningful fields (`current_command`, `current_stage`,
 * `phases`, …) as they run. This only stamps `saved_at` and re-persists whatever
 * the agent last wrote, so a session that dies between commands stays resumable.
 *
 * Never throws — a failed checkpoint must not break the idle event.
 */
function saveCheckpoint(directory: string): void {
  const slug = basename(directory)
  const planDir = planningDir(directory)
  const filePath = checkpointPath(directory)

  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>
  } catch {
    // No checkpoint yet, or it is unreadable — start from an empty base.
  }

  const checkpoint = {
    ...existing,
    version: "1",
    project: slug,
    saved_at: new Date().toISOString(),
  }

  try {
    if (!existsSync(planDir)) mkdirSync(planDir, { recursive: true })
    writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf-8")
  } catch {
    // Checkpointing is best-effort; the idle log entry below still records the event.
  }
}

/**
 * Read current phase from STATE.md. Returns null if unreadable.
 */
function getPhase(directory: string): string | null {
  try {
    const stateFilePath = statePath(directory)
    const content = readFileSync(stateFilePath, "utf-8")
    const state = parseState(content)
    const currentPhase = (state["current_phase"] || {}) as Record<string, unknown>
    return (currentPhase["phase"] as string) ?? null
  } catch {
    return null
  }
}
