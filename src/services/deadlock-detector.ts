/**
 * Deadlock and Loop Detector
 * Analyzes agent spans for stuck execution patterns:
 * - Agent bounce: two agents repeatedly hand off the same unresolved task
 * - Step retry loop: same agent:stage executed beyond threshold without progress
 * - Circular delegation: A → B → ... → A
 * - Stage stall: a span has been "running" longer than the stall threshold
 *
 * New signals are appended to .codebase/DEADLOCK_SIGNALS.jsonl.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { randomUUID } from "crypto"
import { getTraceSpans } from "./agent-trace-graph"
import { loadFlowDeckConfig } from "../config"

export type DeadlockType =
  | "agent_bounce"        // two agents ping-pong the same unresolved task
  | "step_retry_loop"     // same agent:stage retried without meaningful change
  | "circular_delegation" // A → B → ... → A delegation cycle
  | "stage_stall"         // a span stuck in "running" beyond the time threshold

export type RecoveryAction =
  | "retry_with_context"
  | "fallback_agent"
  | "escalate_human"
  | "stop"

export interface DeadlockSignal {
  signal_id: string
  trace_id: string
  detected_at: string
  type: DeadlockType
  evidence: string[]
  agents_involved: string[]
  recommended_action: RecoveryAction
  /** Whether the system should auto-stop the run (from config) */
  auto_stop: boolean
}

interface DeadlockConfig {
  enabled: boolean
  bounceThreshold: number
  retryLoopThreshold: number
  stageStallMinutes: number
  autoStop: boolean
}

function resolveConfig(directory: string): DeadlockConfig {
  try {
    const config = loadFlowDeckConfig(directory)
    const dc = (config as Record<string, unknown> & {
      governance?: {
        deadlockDetection?: {
          enabled?: boolean
          bounceThreshold?: number
          retryLoopThreshold?: number
          stageStallMinutes?: number
          autoStop?: boolean
        }
      }
    })?.governance?.deadlockDetection
    return {
      enabled: dc?.enabled ?? true,
      bounceThreshold: dc?.bounceThreshold ?? 3,
      retryLoopThreshold: dc?.retryLoopThreshold ?? 3,
      stageStallMinutes: dc?.stageStallMinutes ?? 30,
      autoStop: dc?.autoStop ?? false,
    }
  } catch {
    return { enabled: true, bounceThreshold: 3, retryLoopThreshold: 3, stageStallMinutes: 30, autoStop: false }
  }
}

export function deadlockSignalsPath(dir: string): string {
  return join(codebaseDir(dir), "DEADLOCK_SIGNALS.jsonl")
}

function appendSignal(dir: string, signal: DeadlockSignal): void {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  appendFileSync(deadlockSignalsPath(dir), JSON.stringify(signal) + "\n", "utf-8")
}

export function getSignals(dir: string, trace_id?: string): DeadlockSignal[] {
  const p = deadlockSignalsPath(dir)
  if (!existsSync(p)) return []
  try {
    const all = readFileSync(p, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(l => JSON.parse(l) as DeadlockSignal)
    return trace_id ? all.filter(s => s.trace_id === trace_id) : all
  } catch {
    return []
  }
}

// ─── Detectors ────────────────────────────────────────────────────────────────

function detectAgentBounce(dir: string, trace_id: string, cfg: DeadlockConfig): DeadlockSignal | null {
  const spans = getTraceSpans(dir, trace_id)
  const pairCounts: Record<string, number> = {}

  for (let i = 1; i < spans.length; i++) {
    const key = `${spans[i - 1].agent}→${spans[i].agent}`
    pairCounts[key] = (pairCounts[key] ?? 0) + 1
  }

  for (const [pair, count] of Object.entries(pairCounts)) {
    if (count >= cfg.bounceThreshold) {
      const [a, b] = pair.split("→")
      return {
        signal_id: randomUUID(),
        trace_id,
        detected_at: new Date().toISOString(),
        type: "agent_bounce",
        evidence: [`Agent pair "${pair}" handed off ${count} times (threshold: ${cfg.bounceThreshold})`],
        agents_involved: [a, b],
        recommended_action: "escalate_human",
        auto_stop: cfg.autoStop,
      }
    }
  }
  return null
}

function detectCircularDelegation(dir: string, trace_id: string, cfg: DeadlockConfig): DeadlockSignal | null {
  const spans = getTraceSpans(dir, trace_id)
  const graph: Record<string, Set<string>> = {}

  for (const span of spans) {
    if (!graph[span.invoker]) graph[span.invoker] = new Set()
    graph[span.invoker].add(span.agent)
  }

  // DFS cycle detection
  function findCycle(node: string, visited: Set<string>, stack: string[]): string[] | null {
    visited.add(node)
    for (const neighbor of [...(graph[node] ?? [])]) {
      if (stack.includes(neighbor)) return [...stack, neighbor]
      if (!visited.has(neighbor)) {
        const result = findCycle(neighbor, visited, [...stack, neighbor])
        if (result) return result
      }
    }
    return null
  }

  const visited = new Set<string>()
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      const cycle = findCycle(node, visited, [node])
      if (cycle) {
        return {
          signal_id: randomUUID(),
          trace_id,
          detected_at: new Date().toISOString(),
          type: "circular_delegation",
          evidence: [`Delegation cycle: ${cycle.join(" → ")}`],
          agents_involved: cycle,
          recommended_action: "stop",
          auto_stop: true,
        }
      }
    }
  }
  return null
}

function detectStepRetryLoop(dir: string, trace_id: string, cfg: DeadlockConfig): DeadlockSignal | null {
  const spans = getTraceSpans(dir, trace_id)
  const stageCounts: Record<string, number> = {}
  const stageAgents: Record<string, Set<string>> = {}

  for (const span of spans) {
    const key = `${span.agent}:${span.stage}`
    stageCounts[key] = (stageCounts[key] ?? 0) + 1
    if (!stageAgents[key]) stageAgents[key] = new Set()
    stageAgents[key].add(span.agent)
  }

  for (const [key, count] of Object.entries(stageCounts)) {
    if (count >= cfg.retryLoopThreshold) {
      return {
        signal_id: randomUUID(),
        trace_id,
        detected_at: new Date().toISOString(),
        type: "step_retry_loop",
        evidence: [`Stage "${key}" executed ${count} times (threshold: ${cfg.retryLoopThreshold})`],
        agents_involved: [...(stageAgents[key] ?? new Set())],
        recommended_action: "escalate_human",
        auto_stop: cfg.autoStop,
      }
    }
  }
  return null
}

function detectStageStall(dir: string, trace_id: string, cfg: DeadlockConfig): DeadlockSignal | null {
  const spans = getTraceSpans(dir, trace_id)
  const now = Date.now()

  for (const span of spans) {
    if (span.status !== "running") continue
    const elapsed = (now - new Date(span.started_at).getTime()) / 1000 / 60
    if (elapsed >= cfg.stageStallMinutes) {
      return {
        signal_id: randomUUID(),
        trace_id,
        detected_at: new Date().toISOString(),
        type: "stage_stall",
        evidence: [
          `Agent "${span.agent}" in stage "${span.stage}" running for ${Math.round(elapsed)}min (threshold: ${cfg.stageStallMinutes}min)`,
        ],
        agents_involved: [span.agent],
        recommended_action: "escalate_human",
        auto_stop: cfg.autoStop,
      }
    }
  }
  return null
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all detectors for a trace. Returns newly detected signals (not previously emitted).
 */
export function detectDeadlocks(dir: string, trace_id: string): DeadlockSignal[] {
  const cfg = resolveConfig(dir)
  if (!cfg.enabled) return []

  const existingTypes = new Set(getSignals(dir, trace_id).map(s => s.type))
  const candidates = [
    detectAgentBounce(dir, trace_id, cfg),
    detectCircularDelegation(dir, trace_id, cfg),
    detectStepRetryLoop(dir, trace_id, cfg),
    detectStageStall(dir, trace_id, cfg),
  ]

  const newSignals = candidates.filter((s): s is DeadlockSignal => s !== null && !existingTypes.has(s.type))
  for (const signal of newSignals) appendSignal(dir, signal)
  return newSignals
}

/**
 * Returns true if any signal for this trace has auto_stop=true.
 */
export function isTraceStuck(dir: string, trace_id: string): boolean {
  return getSignals(dir, trace_id).some(s => s.auto_stop)
}
