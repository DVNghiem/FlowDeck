/**
 * Cost Estimator Service
 *
 * Provides USD cost estimates for model calls based on a pricing table.
 * Covers common OpenCode-compatible models (Anthropic, OpenAI, Google).
 *
 * Prices are per 1,000 tokens (input / output) in USD.
 * Rates reflect publicly available list pricing; update when vendors change them.
 *
 * Usage:
 *   import { estimateCostUSD, getCostReport } from "./cost-estimator"
 *   const cost = estimateCostUSD("claude-sonnet-4.6", 5000, 1200)
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import type { MetricEvent } from "./token-metrics"
import { estimateTokens } from "./token-metrics"

// ─── Pricing table ─────────────────────────────────────────────────────────────

/** Cost per million tokens in USD. */
interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number
  /** USD per 1M output tokens. */
  output: number
}

/**
 * Pricing table — USD per million tokens.
 * Keys are matched with startsWith so "claude-sonnet-4.6" matches "claude-sonnet".
 * Add entries in descending specificity order (most specific first).
 */
const PRICING_TABLE: Array<{ prefix: string; pricing: ModelPricing }> = [
  // Anthropic Claude
  { prefix: "claude-opus-4",           pricing: { input: 15.0,  output: 75.0 } },
  { prefix: "claude-opus",             pricing: { input: 15.0,  output: 75.0 } },
  { prefix: "claude-sonnet-4",         pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "claude-sonnet-3-5",       pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "claude-sonnet-3",         pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "claude-sonnet",           pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "claude-haiku-4",          pricing: { input:  0.8,  output:  4.0 } },
  { prefix: "claude-haiku-3-5",        pricing: { input:  0.8,  output:  4.0 } },
  { prefix: "claude-haiku",            pricing: { input:  0.25, output:  1.25 } },
  { prefix: "claude-3-opus",           pricing: { input: 15.0,  output: 75.0 } },
  { prefix: "claude-3-5-sonnet",       pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "claude-3-sonnet",         pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "claude-3-haiku",          pricing: { input:  0.25, output:  1.25 } },
  { prefix: "claude",                  pricing: { input:  3.0,  output: 15.0 } },
  // OpenAI GPT
  { prefix: "gpt-5.4-mini",            pricing: { input:  0.15, output:  0.60 } },
  { prefix: "gpt-5-mini",              pricing: { input:  0.15, output:  0.60 } },
  { prefix: "gpt-4.1",                 pricing: { input:  2.0,  output:  8.0 } },
  { prefix: "gpt-4o-mini",             pricing: { input:  0.15, output:  0.60 } },
  { prefix: "gpt-4o",                  pricing: { input:  2.5,  output: 10.0 } },
  { prefix: "gpt-4-turbo",             pricing: { input: 10.0,  output: 30.0 } },
  { prefix: "gpt-4",                   pricing: { input: 30.0,  output: 60.0 } },
  { prefix: "gpt-3.5",                 pricing: { input:  0.5,  output:  1.5 } },
  { prefix: "gpt-5",                   pricing: { input: 10.0,  output: 30.0 } },
  { prefix: "o3-mini",                 pricing: { input:  1.1,  output:  4.4 } },
  { prefix: "o3",                      pricing: { input: 10.0,  output: 40.0 } },
  { prefix: "o1-mini",                 pricing: { input:  1.1,  output:  4.4 } },
  { prefix: "o1",                      pricing: { input: 15.0,  output: 60.0 } },
  // Google Gemini
  { prefix: "gemini-2.0-flash",        pricing: { input:  0.10, output:  0.40 } },
  { prefix: "gemini-2.5-flash",        pricing: { input:  0.15, output:  0.60 } },
  { prefix: "gemini-2.5-pro",          pricing: { input:  1.25, output:  5.0 } },
  { prefix: "gemini-1.5-flash",        pricing: { input:  0.075,output:  0.30 } },
  { prefix: "gemini-1.5-pro",          pricing: { input:  1.25, output:  5.0 } },
  { prefix: "gemini",                  pricing: { input:  0.10, output:  0.40 } },
  // GitHub Copilot / proxy models (normalised names)
  { prefix: "github-copilot/sonnet",   pricing: { input:  3.0,  output: 15.0 } },
  { prefix: "github-copilot/haiku",    pricing: { input:  0.25, output:  1.25 } },
  { prefix: "github-copilot/gpt-4",    pricing: { input:  2.5,  output: 10.0 } },
  { prefix: "github-copilot",          pricing: { input:  3.0,  output: 15.0 } },
]

/** Fallback pricing when the model is unknown. Uses mid-tier Sonnet rates. */
const FALLBACK_PRICING: ModelPricing = { input: 3.0, output: 15.0 }

/**
 * Resolve pricing for a model identifier string.
 * Matching is case-insensitive prefix match; more specific prefixes take priority.
 */
export function getModelPricing(model: string): ModelPricing {
  if (!model) return FALLBACK_PRICING
  const lower = model.toLowerCase()
  for (const entry of PRICING_TABLE) {
    if (lower.startsWith(entry.prefix.toLowerCase())) return entry.pricing
  }
  return FALLBACK_PRICING
}

/**
 * Estimate USD cost for a single model call.
 *
 * @param model - Model identifier (e.g. "claude-sonnet-4.6", "gpt-4o")
 * @param inputTokens - Number of input tokens (use estimateTokens() if char count only)
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD (unrounded — round at display time)
 */
export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model)
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

/**
 * Estimate cost from raw character counts using the 4 chars/token heuristic.
 * Convenience wrapper for callers that don't have token counts.
 */
export function estimateCostFromChars(
  model: string,
  inputChars: number,
  outputChars: number,
): number {
  return estimateCostUSD(model, estimateTokens(String("x").repeat(inputChars)), estimateTokens(String("x").repeat(outputChars)))
}

// ─── Cost report ───────────────────────────────────────────────────────────────

export interface AgentCostEntry {
  agent: string
  model_calls: number
  cache_hits: number
  retries: number
  est_input_tokens: number
  est_output_tokens: number
  est_cost_usd: number
}

export interface StageCostEntry {
  stage: string
  model_calls: number
  cache_hits: number
  retries: number
  est_input_tokens: number
  est_output_tokens: number
  est_cost_usd: number
  /** Fraction of total workflow cost (0–1). */
  cost_fraction: number
}

export interface CostReport {
  workflow_id: string
  /** Per-agent breakdown. */
  by_agent: AgentCostEntry[]
  /** Per-stage breakdown. */
  by_stage: StageCostEntry[]
  totals: {
    model_calls: number
    cache_hits: number
    retries: number
    est_input_tokens: number
    est_output_tokens: number
    est_cost_usd: number
    /** Tokens/$ saved by cache hits (based on avg per-call token count). */
    cache_savings_est_usd: number
    /** Tokens/$ wasted by retries. */
    retry_cost_est_usd: number
    cache_hit_rate: number
    retry_rate: number
  }
  /** Sorted from most to least expensive. */
  most_expensive_agents: string[]
  most_expensive_stages: string[]
}

/**
 * Build a cost report from MetricEvent[] for a given workflow.
 *
 * The caller is responsible for loading the events (from TOKEN_METRICS.jsonl).
 * `defaultModel` is used when an event has no model field.
 */
export function buildCostReport(
  workflowId: string,
  events: MetricEvent[],
  defaultModel = "",
): CostReport {
  const workflowEvents = events.filter(e => e.workflow_id === workflowId)

  const agentMap = new Map<string, AgentCostEntry>()
  const stageMap = new Map<string, StageCostEntry>()

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCost = 0
  let totalCalls = 0
  let totalCacheHits = 0
  let totalRetries = 0
  let retryCost = 0

  // Compute avg tokens per call for estimating cache savings
  const modelCallEvents = workflowEvents.filter(e => e.event === "model_call")
  const avgInputTokensPerCall = modelCallEvents.length > 0
    ? modelCallEvents.reduce((s, e) => s + e.est_input_tokens, 0) / modelCallEvents.length
    : 0
  const avgOutputTokensPerCall = modelCallEvents.length > 0
    ? modelCallEvents.reduce((s, e) => s + e.est_output_tokens, 0) / modelCallEvents.length
    : 0

  for (const e of workflowEvents) {
    const model = e.model ?? defaultModel
    const agentKey = e.agent ?? "(unknown)"
    const stageKey = e.stage

    if (!agentMap.has(agentKey)) {
      agentMap.set(agentKey, { agent: agentKey, model_calls: 0, cache_hits: 0, retries: 0, est_input_tokens: 0, est_output_tokens: 0, est_cost_usd: 0 })
    }
    if (!stageMap.has(stageKey)) {
      stageMap.set(stageKey, { stage: stageKey, model_calls: 0, cache_hits: 0, retries: 0, est_input_tokens: 0, est_output_tokens: 0, est_cost_usd: 0, cost_fraction: 0 })
    }

    const agentEntry = agentMap.get(agentKey)!
    const stageEntry = stageMap.get(stageKey)!

    if (e.event === "model_call") {
      const cost = estimateCostUSD(model, e.est_input_tokens, e.est_output_tokens)
      agentEntry.model_calls++
      agentEntry.est_input_tokens += e.est_input_tokens
      agentEntry.est_output_tokens += e.est_output_tokens
      agentEntry.est_cost_usd += cost
      stageEntry.model_calls++
      stageEntry.est_input_tokens += e.est_input_tokens
      stageEntry.est_output_tokens += e.est_output_tokens
      stageEntry.est_cost_usd += cost
      totalCalls++
      totalInputTokens += e.est_input_tokens
      totalOutputTokens += e.est_output_tokens
      totalCost += cost
    } else if (e.event === "cache_hit") {
      agentEntry.cache_hits++
      stageEntry.cache_hits++
      totalCacheHits++
    } else if (e.event === "retry") {
      const cost = estimateCostUSD(model, e.est_input_tokens, e.est_output_tokens)
      agentEntry.retries++
      agentEntry.est_cost_usd += cost
      stageEntry.retries++
      stageEntry.est_cost_usd += cost
      totalRetries++
      retryCost += cost
      totalCost += cost
      totalInputTokens += e.est_input_tokens
      totalOutputTokens += e.est_output_tokens
    }
  }

  // Compute cost fractions
  for (const entry of stageMap.values()) {
    entry.cost_fraction = totalCost > 0 ? entry.est_cost_usd / totalCost : 0
  }

  const byAgent = Array.from(agentMap.values()).sort((a, b) => b.est_cost_usd - a.est_cost_usd)
  const byStage = Array.from(stageMap.values()).sort((a, b) => b.est_cost_usd - a.est_cost_usd)

  // Cache savings: if a cache hit had been a model call, estimate what it would have cost
  const avgCallCost = estimateCostUSD(defaultModel, avgInputTokensPerCall, avgOutputTokensPerCall)
  const cacheSavingsEstUsd = totalCacheHits * avgCallCost

  const totalRequests = totalCalls + totalCacheHits + totalRetries
  const cacheHitRate = totalRequests > 0 ? totalCacheHits / totalRequests : 0
  const retryRate = totalCalls > 0 ? totalRetries / totalCalls : 0

  return {
    workflow_id: workflowId,
    by_agent: byAgent,
    by_stage: byStage,
    totals: {
      model_calls: totalCalls,
      cache_hits: totalCacheHits,
      retries: totalRetries,
      est_input_tokens: totalInputTokens,
      est_output_tokens: totalOutputTokens,
      est_cost_usd: totalCost,
      cache_savings_est_usd: cacheSavingsEstUsd,
      retry_cost_est_usd: retryCost,
      cache_hit_rate: Math.round(cacheHitRate * 1000) / 1000,
      retry_rate: Math.round(retryRate * 1000) / 1000,
    },
    most_expensive_agents: byAgent.slice(0, 3).map(a => a.agent),
    most_expensive_stages: byStage.slice(0, 3).map(s => s.stage),
  }
}

/**
 * Load MetricEvents from TOKEN_METRICS.jsonl for a workflow and build a CostReport.
 * Convenience wrapper around buildCostReport for production use.
 */
export function getCostReport(dir: string, workflowId: string, defaultModel = ""): CostReport {
  const metricsPath = join(codebaseDir(dir), "TOKEN_METRICS.jsonl")
  if (!existsSync(metricsPath)) {
    return buildCostReport(workflowId, [], defaultModel)
  }
  try {
    const events = readFileSync(metricsPath, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(l => JSON.parse(l) as MetricEvent)
    return buildCostReport(workflowId, events, defaultModel)
  } catch {
    return buildCostReport(workflowId, [], defaultModel)
  }
}

/**
 * Format a cost report as a human-readable summary string (for logging/display).
 * Returns compact output — use for appLog or tool output.
 */
export function formatCostReport(report: CostReport): string {
  const { totals } = report
  const lines: string[] = [
    `cost_report workflow=${report.workflow_id}`,
    `  total: $${totals.est_cost_usd.toFixed(6)} | calls=${totals.model_calls} cache_hits=${totals.cache_hits} retries=${totals.retries}`,
    `  tokens: in=${totals.est_input_tokens} out=${totals.est_output_tokens}`,
    `  cache_hit_rate=${(totals.cache_hit_rate * 100).toFixed(1)}% cache_savings=$${totals.cache_savings_est_usd.toFixed(6)}`,
    `  retry_rate=${(totals.retry_rate * 100).toFixed(1)}% retry_cost=$${totals.retry_cost_est_usd.toFixed(6)}`,
  ]
  if (report.most_expensive_stages.length > 0) {
    lines.push(`  expensive_stages: ${report.most_expensive_stages.join(", ")}`)
  }
  if (report.most_expensive_agents.length > 0) {
    lines.push(`  expensive_agents: ${report.most_expensive_agents.join(", ")}`)
  }
  return lines.join("\n")
}
