/**
 * Agent configuration in OpenCode v2 terms. This replaces the V1 SDK
 * `AgentConfig` type; `src/index.ts` maps these fields onto the V2
 * `Agent.Info` registry via `ctx.agent.transform`.
 */
export interface AgentConfig {
  /** Model reference in `provider/model` form; omitted inherits the session model. */
  model?: string
  temperature?: number
  prompt?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  /** Hex color code (e.g., #FF5733) or theme color (e.g., primary) */
  color?: string | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info"
  steps?: number
}

export interface AgentDefinition {
  name: string;
  displayName?: string;
  description?: string;
  config: AgentConfig;
  /** Priority-ordered model entries for runtime fallback resolution. */
  _modelArray?: Array<{ id: string; variant?: string }>;
}

/**
 * Resolve agent prompt from base/custom/append inputs.
 * If customPrompt is provided, it replaces the base entirely.
 * Otherwise, customAppendPrompt is appended to the base.
 */
export function resolvePrompt(
  base: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): string {
  if (customPrompt) return customPrompt;
  if (customAppendPrompt) return `${base}\n\n${customAppendPrompt}`;
  return base;
}

export type AgentFactory = (
  model: string | undefined,
  customPrompt?: string,
  customAppendPrompt?: string,
) => AgentDefinition;