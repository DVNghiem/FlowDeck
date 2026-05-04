/**
 * Telemetry Service
 * Appends structured events to .codebase/TELEMETRY.jsonl for observability
 * and feeds the AgentOps dashboard.
 */
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { randomUUID } from "crypto"

export type TelemetryEventType =
  | "command.start"
  | "command.end"
  | "tool.call"
  | "tool.complete"
  | "agent.dispatch"
  | "agent.complete"
  | "approval.request"
  | "approval.resolve"
  | "run.complete"
  | "run.fail"
  | "policy.violation"
  | "patch.scored"

export interface TelemetryEvent {
  id: string
  ts: string
  session_id: string
  run_id: string
  event: TelemetryEventType
  command?: string
  agent?: string
  tool?: string
  model?: string
  duration_ms?: number
  status?: "ok" | "error" | "blocked" | "approved" | "rejected"
  risk_score?: number
  files?: string[]
  cost_estimate?: number
  error_category?: string
  meta?: Record<string, unknown>
}

export function telemetryPath(dir: string): string {
  return join(codebaseDir(dir), "TELEMETRY.jsonl")
}

export function appendEvent(dir: string, partial: Omit<TelemetryEvent, "id" | "ts">): TelemetryEvent | null {
  if (process.env.TELEMETRY_ENABLED === "false") return null

  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })

  const event: TelemetryEvent = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    ...partial,
  }
  appendFileSync(telemetryPath(dir), JSON.stringify(event) + "\n", "utf-8")
  return event
}

export function readEvents(dir: string, limit = 100): TelemetryEvent[] {
  const p = telemetryPath(dir)
  if (!existsSync(p)) return []
  try {
    const lines = readFileSync(p, "utf-8").trim().split("\n").filter(Boolean)
    const recent = lines.slice(-limit)
    return recent.map(l => JSON.parse(l) as TelemetryEvent)
  } catch {
    return []
  }
}

export function getRunEvents(dir: string, run_id: string): TelemetryEvent[] {
  return readEvents(dir, 500).filter(e => e.run_id === run_id)
}

export interface CommandSummary {
  command: string
  total_runs: number
  successes: number
  failures: number
  avg_duration_ms: number
  last_run: string
}

export function getCommandSummary(dir: string, n = 200): CommandSummary[] {
  const events = readEvents(dir, n)
  const byCommand: Record<string, { runs: number; ok: number; fail: number; durations: number[]; last: string }> = {}

  for (const e of events) {
    if (e.event !== "command.end" || !e.command) continue
    if (!byCommand[e.command]) byCommand[e.command] = { runs: 0, ok: 0, fail: 0, durations: [], last: "" }
    const c = byCommand[e.command]
    c.runs++
    if (e.status === "ok") c.ok++
    else if (e.status === "error") c.fail++
    if (e.duration_ms) c.durations.push(e.duration_ms)
    if (!c.last || e.ts > c.last) c.last = e.ts
  }

  return Object.entries(byCommand).map(([command, c]) => ({
    command,
    total_runs: c.runs,
    successes: c.ok,
    failures: c.fail,
    avg_duration_ms: c.durations.length ? Math.round(c.durations.reduce((a, b) => a + b, 0) / c.durations.length) : 0,
    last_run: c.last,
  }))
}

export function getRecentToolFailures(dir: string, limit = 20): TelemetryEvent[] {
  return readEvents(dir, 200)
    .filter(e => (e.event === "tool.complete" || e.event === "tool.call") && e.status === "error")
    .slice(-limit)
}
