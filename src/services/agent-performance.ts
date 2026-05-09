/**
 * Agent Performance Service
 * Tracks success rates, cost, and duration by agent+model+task type.
 * Stores results in .codebase/AGENT_PERF.json.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import type { TaskType } from "../tools/dispatch-routing"

export interface AgentPerfEntry {
  agent: string
  model: string
  task_type: TaskType
  runs: number
  successes: number
  failures: number
  total_duration_ms: number
  total_cost: number
  last_run: string
  last_status: "success" | "failure"
}

interface AgentPerfStore {
  entries: AgentPerfEntry[]
  updated_at: string
}

function perfPath(dir: string): string {
  return join(codebaseDir(dir), "AGENT_PERF.json")
}

function loadStore(dir: string): AgentPerfStore {
  const p = perfPath(dir)
  if (!existsSync(p)) return { entries: [], updated_at: new Date().toISOString() }
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as AgentPerfStore
  } catch {
    return { entries: [], updated_at: new Date().toISOString() }
  }
}

function saveStore(dir: string, store: AgentPerfStore): void {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  writeFileSync(perfPath(dir), JSON.stringify(store, null, 2), "utf-8")
}

function makeKey(agent: string, model: string, task_type: TaskType): string {
  return `${agent}::${model}::${task_type}`
}

export function recordRun(
  dir: string,
  agent: string,
  model: string,
  task_type: TaskType,
  success: boolean,
  duration_ms: number,
  cost = 0
): void {
  const store = loadStore(dir)
  const key = makeKey(agent, model, task_type)
  const existing = store.entries.find(
    e => makeKey(e.agent, e.model, e.task_type) === key
  )

  if (existing) {
    existing.runs++
    if (success) existing.successes++
    else existing.failures++
    existing.total_duration_ms += duration_ms
    existing.total_cost += cost
    existing.last_run = new Date().toISOString()
    existing.last_status = success ? "success" : "failure"
  } else {
    store.entries.push({
      agent,
      model,
      task_type,
      runs: 1,
      successes: success ? 1 : 0,
      failures: success ? 0 : 1,
      total_duration_ms: duration_ms,
      total_cost: cost,
      last_run: new Date().toISOString(),
      last_status: success ? "success" : "failure",
    })
  }

  store.updated_at = new Date().toISOString()
  saveStore(dir, store)
}

export function getStats(
  dir: string,
  filter?: { agent?: string; task_type?: TaskType }
): AgentPerfEntry[] {
  const store = loadStore(dir)
  let entries = store.entries

  if (filter?.agent) entries = entries.filter(e => e.agent === filter.agent)
  if (filter?.task_type) entries = entries.filter(e => e.task_type === filter.task_type)

  return entries
}

export interface AgentRecommendation {
  agent: string
  model: string
  success_rate: number
  avg_duration_ms: number
  avg_cost: number
  runs: number
}

export function getBestAgentForTask(dir: string, task_type: TaskType): AgentRecommendation | null {
  const entries = getStats(dir, { task_type })
  if (entries.length === 0) return null

  const ranked = entries
    .filter(e => e.runs >= 3) // require minimum sample size
    .map(e => ({
      agent: e.agent,
      model: e.model,
      success_rate: e.successes / e.runs,
      avg_duration_ms: Math.round(e.total_duration_ms / e.runs),
      avg_cost: e.total_cost / e.runs,
      runs: e.runs,
    }))
    .sort((a, b) => b.success_rate - a.success_rate || a.avg_cost - b.avg_cost)

  return ranked[0] ?? null
}

export function getAgentLeaderboard(dir: string): AgentRecommendation[] {
  const entries = getStats(dir)
  return entries
    .filter(e => e.runs >= 2)
    .map(e => ({
      agent: e.agent,
      model: e.model,
      success_rate: e.successes / e.runs,
      avg_duration_ms: Math.round(e.total_duration_ms / e.runs),
      avg_cost: e.total_cost / e.runs,
      runs: e.runs,
    }))
    .sort((a, b) => b.success_rate - a.success_rate)
}
