/**
 * Agent Trace Graph Service
 * Records inter-agent execution as a causal span graph.
 * Each agent invocation opens a span; spans link via parent_span_id to form a DAG.
 * Stored in .codebase/AGENT_SPANS.jsonl — reusable by dashboard for timeline and graph views.
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import { randomUUID } from "crypto"

export type SpanStatus = "running" | "complete" | "failed" | "blocked" | "skipped"

export interface AgentSpan {
  span_id: string
  /** trace_id = run_id of the root workflow run */
  trace_id: string
  /** span_id of the parent invocation; absent for the root agent */
  parent_span_id?: string
  /** Agent or system that delegated to this agent */
  invoker: string
  /** This agent's name */
  agent: string
  task_description: string
  stage: string
  started_at: string
  ended_at?: string
  status: SpanStatus
  /** Whether the agent produced a schema-valid output */
  output_valid: boolean
  /** Contract violation messages recorded during this span */
  contract_violations: string[]
  /** Tool names used during this span */
  tools_used: string[]
  /** Structured payload passed to the next agent */
  handoff_payload?: Record<string, unknown>
  latency_ms?: number
  model?: string
  cost_estimate?: number
  retry_count: number
  /** Delegation depth: root agent is 0, its delegate is 1, etc. */
  depth: number
}

export interface TraceGraph {
  trace_id: string
  root_agent: string
  started_at: string
  ended_at?: string
  spans: AgentSpan[]
  total_agents: number
  total_unique_tools: number
  max_depth: number
  failed_spans: number
  retry_total: number
}

export function agentSpansPath(dir: string): string {
  return join(codebaseDir(dir), "AGENT_SPANS.jsonl")
}

function loadAllSpans(dir: string): AgentSpan[] {
  const p = agentSpansPath(dir)
  if (!existsSync(p)) return []
  try {
    return readFileSync(p, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(l => JSON.parse(l) as AgentSpan)
  } catch {
    return []
  }
}

function saveAllSpans(dir: string, spans: AgentSpan[]): void {
  const p = agentSpansPath(dir)
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
  writeFileSync(p, spans.map(s => JSON.stringify(s)).join("\n") + "\n", "utf-8")
}

/**
 * Open a new agent span. Call this when an agent is about to start executing.
 */
export function openSpan(
  dir: string,
  opts: {
    trace_id: string
    invoker: string
    agent: string
    task_description: string
    stage: string
    parent_span_id?: string
    depth?: number
    model?: string
  },
): AgentSpan {
  const cd = codebaseDir(dir)
  if (!existsSync(cd)) mkdirSync(cd, { recursive: true })

  const span: AgentSpan = {
    span_id: randomUUID(),
    trace_id: opts.trace_id,
    parent_span_id: opts.parent_span_id,
    invoker: opts.invoker,
    agent: opts.agent,
    task_description: opts.task_description,
    stage: opts.stage,
    started_at: new Date().toISOString(),
    status: "running",
    output_valid: false,
    contract_violations: [],
    tools_used: [],
    retry_count: 0,
    depth: opts.depth ?? 0,
    model: opts.model,
  }

  appendFileSync(agentSpansPath(dir), JSON.stringify(span) + "\n", "utf-8")
  return span
}

/**
 * Close a span when an agent finishes (success, failure, or block).
 */
export function closeSpan(
  dir: string,
  span_id: string,
  status: Exclude<SpanStatus, "running">,
  opts: {
    output_valid?: boolean
    contract_violations?: string[]
    tools_used?: string[]
    handoff_payload?: Record<string, unknown>
    cost_estimate?: number
    retry_count?: number
  } = {},
): void {
  const spans = loadAllSpans(dir)
  const idx = spans.findLastIndex(s => s.span_id === span_id)
  if (idx === -1) return

  const startedMs = new Date(spans[idx].started_at).getTime()
  spans[idx] = {
    ...spans[idx],
    ended_at: new Date().toISOString(),
    status,
    latency_ms: Date.now() - startedMs,
    output_valid: opts.output_valid ?? false,
    contract_violations: opts.contract_violations ?? spans[idx].contract_violations,
    tools_used: opts.tools_used ?? spans[idx].tools_used,
    handoff_payload: opts.handoff_payload,
    cost_estimate: opts.cost_estimate,
    retry_count: opts.retry_count ?? spans[idx].retry_count,
  }
  saveAllSpans(dir, spans)
}

/**
 * Append a tool name to the span's tools_used list.
 */
export function recordToolUsed(dir: string, span_id: string, toolName: string): void {
  const spans = loadAllSpans(dir)
  const idx = spans.findLastIndex(s => s.span_id === span_id)
  if (idx === -1) return
  if (!spans[idx].tools_used.includes(toolName)) {
    spans[idx].tools_used = [...spans[idx].tools_used, toolName]
    saveAllSpans(dir, spans)
  }
}

/**
 * Record a contract violation on the active span.
 */
export function addSpanViolation(dir: string, span_id: string, violation: string): void {
  const spans = loadAllSpans(dir)
  const idx = spans.findLastIndex(s => s.span_id === span_id)
  if (idx === -1) return
  spans[idx].contract_violations = [...spans[idx].contract_violations, violation]
  saveAllSpans(dir, spans)
}

export function getSpan(dir: string, span_id: string): AgentSpan | null {
  return loadAllSpans(dir).findLast(s => s.span_id === span_id) ?? null
}

export function getTraceSpans(dir: string, trace_id: string): AgentSpan[] {
  return loadAllSpans(dir).filter(s => s.trace_id === trace_id)
}

/**
 * Build the full trace graph for a run.
 * Returns null if no spans exist for the trace.
 */
export function buildTraceGraph(dir: string, trace_id: string): TraceGraph | null {
  const spans = getTraceSpans(dir, trace_id)
  if (spans.length === 0) return null

  const root = spans.find(s => !s.parent_span_id) ?? spans[0]
  const uniqueTools = new Set(spans.flatMap(s => s.tools_used))
  const maxDepth = spans.reduce((m, s) => Math.max(m, s.depth), 0)

  return {
    trace_id,
    root_agent: root.agent,
    started_at: root.started_at,
    ended_at: spans.findLast(s => s.ended_at)?.ended_at,
    spans,
    total_agents: spans.length,
    total_unique_tools: uniqueTools.size,
    max_depth: maxDepth,
    failed_spans: spans.filter(s => s.status === "failed").length,
    retry_total: spans.reduce((sum, s) => sum + s.retry_count, 0),
  }
}

/**
 * Return the most recent trace IDs (most recent first).
 */
export function listRecentTraceIds(dir: string, limit = 10): string[] {
  const spans = loadAllSpans(dir)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (let i = spans.length - 1; i >= 0; i--) {
    if (!seen.has(spans[i].trace_id)) {
      seen.add(spans[i].trace_id)
      ordered.push(spans[i].trace_id)
    }
    if (ordered.length >= limit) break
  }
  return ordered
}
