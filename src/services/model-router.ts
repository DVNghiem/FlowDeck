/**
 * Model Router Service
 * Routes task types to the best model/provider based on task type, risk score,
 * and per-repo configuration. Reads .codebase/MODEL_ROUTER.json for overrides.
 */
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"

export type TaskType =
  | "planning"
  | "design"
  | "implementation"
  | "debugging"
  | "review"
  | "testing"
  | "documentation"
  | "analysis"
  | "security"
  | "orchestration"

export interface ModelRoute {
  primary: string
  fallback?: string
  high_risk_override?: string
  temperature?: number
  reasoning_effort?: "low" | "medium" | "high"
}

export type ModelRouterConfig = Record<TaskType, ModelRoute>

const DEFAULT_ROUTING: ModelRouterConfig = {
  planning: { primary: "claude-sonnet-4-5", temperature: 0.3, reasoning_effort: "medium" },
  design: { primary: "claude-sonnet-4-5", fallback: "claude-opus-4-5", temperature: 0.2, reasoning_effort: "high" },
  implementation: { primary: "claude-opus-4-5", fallback: "claude-sonnet-4-5", high_risk_override: "claude-opus-4-5", temperature: 0.2, reasoning_effort: "high" },
  debugging: { primary: "claude-sonnet-4-5", high_risk_override: "claude-opus-4-5", temperature: 0.2, reasoning_effort: "high" },
  review: { primary: "gemini-2.5-flash", fallback: "claude-haiku-4-5", temperature: 0.1, reasoning_effort: "medium" },
  testing: { primary: "claude-haiku-4-5", fallback: "gemini-2.5-flash", temperature: 0.1, reasoning_effort: "low" },
  documentation: { primary: "claude-sonnet-4-5", fallback: "gemini-2.5-flash", temperature: 0.3, reasoning_effort: "low" },
  analysis: { primary: "claude-sonnet-4-5", temperature: 0.3, reasoning_effort: "medium" },
  security: { primary: "claude-opus-4-5", high_risk_override: "claude-opus-4-5", temperature: 0.1, reasoning_effort: "high" },
  orchestration: { primary: "claude-sonnet-4-5", temperature: 0.3, reasoning_effort: "medium" },
}

export function getRouterConfig(dir: string): ModelRouterConfig {
  const p = join(codebaseDir(dir), "MODEL_ROUTER.json")
  if (!existsSync(p)) return DEFAULT_ROUTING
  try {
    const overrides = JSON.parse(readFileSync(p, "utf-8")) as Partial<ModelRouterConfig>
    return { ...DEFAULT_ROUTING, ...overrides }
  } catch {
    return DEFAULT_ROUTING
  }
}

export interface RoutedModel {
  model: string
  temperature: number
  reasoning_effort?: "low" | "medium" | "high"
  task_type: TaskType
  is_high_risk: boolean
  is_override: boolean
}

export function routeModel(
  dir: string,
  task_type: TaskType,
  risk_score = 100
): RoutedModel {
  const config = getRouterConfig(dir)
  const route = config[task_type] ?? DEFAULT_ROUTING.implementation
  const is_high_risk = risk_score < 40

  let model = route.primary
  let is_override = false

  if (is_high_risk && route.high_risk_override) {
    model = route.high_risk_override
    is_override = true
  }

  return {
    model,
    temperature: route.temperature ?? 0.3,
    reasoning_effort: route.reasoning_effort,
    task_type,
    is_high_risk,
    is_override,
  }
}

/**
 * Build agent configuration array for multi-agent orchestration.
 * Requires OpenCode runtime integration to be functional.
 * @deprecated Stub - requires OpenCode client.session.create() API
 */
export function buildAgentConfig(
  dir: string,
  agents: Array<{ name: string; task_type: TaskType; risk_score?: number }>
): Array<{ name: string; model: string; temperature: number; reasoningEffort?: string }> {
  return agents.map(a => {
    const routed = routeModel(dir, a.task_type, a.risk_score ?? 100)
    return {
      name: a.name,
      model: routed.model,
      temperature: routed.temperature,
      ...(routed.reasoning_effort ? { reasoningEffort: routed.reasoning_effort } : {}),
    }
  })
}
