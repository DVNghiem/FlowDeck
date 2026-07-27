/**
 * Run Trace Service
 * Records command execution runs to `~/.fd-plan/<slug>/.codebase/RUNS.jsonl` for replay and diff.
 */
import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { randomUUID } from "crypto"

export type RunStatus = "running" | "complete" | "failed" | "cancelled"

export interface RunTrace {
  run_id: string
  session_id: string
  command: string
  args: Record<string, unknown>
  started_at: string
  ended_at?: string
  status: RunStatus
  files_touched: string[]
  event_ids: string[]
  risk_score: number
  outcome?: string
  error?: string
}

export function runsPath(dir: string): string {
  return join(codebaseDir(dir), "RUNS.jsonl")
}

export function startTrace(
  dir: string,
  command: string,
  args: Record<string, unknown>,
  session_id = "session-0"
): RunTrace {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })

  const trace: RunTrace = {
    run_id: randomUUID(),
    session_id,
    command,
    args,
    started_at: new Date().toISOString(),
    status: "running",
    files_touched: [],
    event_ids: [],
    risk_score: 0,
  }
  appendFileSync(runsPath(dir), JSON.stringify(trace) + "\n", "utf-8")
  return trace
}

function loadAllTraces(dir: string): RunTrace[] {
  const p = runsPath(dir)
  if (!existsSync(p)) return []
  try {
    return readFileSync(p, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(l => JSON.parse(l) as RunTrace)
  } catch {
    return []
  }
}

function saveAllTraces(dir: string, traces: RunTrace[]): void {
  const p = runsPath(dir)
  writeFileSync(p, traces.map(t => JSON.stringify(t)).join("\n") + "\n", "utf-8")
}

export function endTrace(
  dir: string,
  run_id: string,
  status: Exclude<RunStatus, "running">,
  outcome?: string,
  error?: string
): void {
  const traces = loadAllTraces(dir)
  const idx = traces.findLastIndex(t => t.run_id === run_id)
  if (idx === -1) return
  traces[idx] = {
    ...traces[idx],
    ended_at: new Date().toISOString(),
    status,
    ...(outcome ? { outcome } : {}),
    ...(error ? { error } : {}),
  }
  saveAllTraces(dir, traces)
}

export function touchFile(dir: string, run_id: string, filePath: string): void {
  const traces = loadAllTraces(dir)
  const idx = traces.findLastIndex(t => t.run_id === run_id)
  if (idx === -1) return
  const files = traces[idx].files_touched
  if (!files.includes(filePath)) {
    traces[idx].files_touched = [...files, filePath]
    saveAllTraces(dir, traces)
  }
}

export function setRiskScore(dir: string, run_id: string, score: number): void {
  const traces = loadAllTraces(dir)
  const idx = traces.findLastIndex(t => t.run_id === run_id)
  if (idx === -1) return
  traces[idx].risk_score = score
  saveAllTraces(dir, traces)
}

export function getTrace(dir: string, run_id: string): RunTrace | null {
  return loadAllTraces(dir).findLast(t => t.run_id === run_id) ?? null
}

export function listTraces(dir: string, limit = 20): RunTrace[] {
  const all = loadAllTraces(dir)
  return all.slice(-limit).reverse()
}

export interface RunDiff {
  run_a: string
  run_b: string
  added_files: string[]
  removed_files: string[]
  shared_files: string[]
  status_changed: boolean
  risk_delta: number
  outcome_changed: boolean
}

export function diffTraces(dir: string, run_id_a: string, run_id_b: string): RunDiff | null {
  const a = getTrace(dir, run_id_a)
  const b = getTrace(dir, run_id_b)
  if (!a || !b) return null

  const setA = new Set(a.files_touched)
  const setB = new Set(b.files_touched)

  return {
    run_a: run_id_a,
    run_b: run_id_b,
    added_files: [...setB].filter(f => !setA.has(f)),
    removed_files: [...setA].filter(f => !setB.has(f)),
    shared_files: [...setA].filter(f => setB.has(f)),
    status_changed: a.status !== b.status,
    risk_delta: b.risk_score - a.risk_score,
    outcome_changed: a.outcome !== b.outcome,
  }
}
