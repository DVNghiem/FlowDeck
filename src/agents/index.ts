import type { AgentConfig } from '@opencode-ai/sdk/v2';

import type { AgentDefinition, AgentFactory } from './types';
import type { AgentRoute } from './routing';
export { resolvePrompt } from './types';
export type { AgentDefinition, AgentFactory } from './types';
export type { AgentRoute } from './routing';

// Import all agent factories
import { createOrchestratorAgent } from './orchestrator';
import { createPlannerAgent } from './planner';
import {
  createBackendCoderAgent,
  createFrontendCoderAgent,
  createDevopsAgent,
} from './coder';
import { createTesterAgent } from './tester';
import { createReviewerAgent } from './reviewer';
import { createResearcherAgent } from './researcher';
import { createSecurityAuditorAgent } from './security-auditor';
import { createMapperAgent } from './mapper';
import { createDebugSpecialistAgent } from './debug';
import { createArchitectAgent } from './architect';

/** All agent names registered by FlowDeck. */
export const AGENT_NAMES: readonly string[] = [
  'orchestrator',
  'planner',
  'architect',
  'researcher',
  'mapper',
  'backend-coder',
  'frontend-coder',
  'devops',
  'tester',
  'reviewer',
  'security-auditor',
  'debug-specialist',
] as const;

// Agent mode classification
export type AgentMode = 'primary' | 'subagent' | 'all';

// Define which agents are primary (UI-selected) vs subagent (internal/delegated)
const PRIMARY_AGENTS = new Set(['orchestrator']);
const ALL_MODES_AGENTS = new Set<string>();
const HIDDEN_AGENTS = new Set<string>();

function isPrimaryAgent(name: string): boolean {
  return PRIMARY_AGENTS.has(name);
}

function isHiddenAgent(name: string): boolean {
  return HIDDEN_AGENTS.has(name);
}

function isAllModeAgent(name: string): boolean {
  return ALL_MODES_AGENTS.has(name);
}

/**
 * Create a single agent by name with optional model and custom prompts.
 * When model is undefined, the agent inherits the model currently selected by the user.
 */
export function createAgent(
  name: string,
  model?: string,
  customPrompt?: string,
  customAppendPrompt?: string,
  _disabledAgents?: Set<string>,
): AgentDefinition | undefined {
  switch (name) {
    case 'orchestrator':
      return createOrchestratorAgent(
        model,
        customPrompt,
        customAppendPrompt,
        undefined,
      );
    case 'planner':
      return createPlannerAgent(model, customPrompt, customAppendPrompt);
    case 'architect':
      return createArchitectAgent(model, customPrompt, customAppendPrompt);
    case 'researcher':
      return createResearcherAgent(model, customPrompt, customAppendPrompt);
    case 'mapper':
      return createMapperAgent(model, customPrompt, customAppendPrompt);
    case 'backend-coder':
      return createBackendCoderAgent(model, customPrompt, customAppendPrompt);
    case 'frontend-coder':
      return createFrontendCoderAgent(model, customPrompt, customAppendPrompt);
    case 'devops':
      return createDevopsAgent(model, customPrompt, customAppendPrompt);
    case 'tester':
      return createTesterAgent(model, customPrompt, customAppendPrompt);
    case 'reviewer':
      return createReviewerAgent(model, customPrompt, customAppendPrompt);
    case 'security-auditor':
      return createSecurityAuditorAgent(
        model,
        customPrompt,
        customAppendPrompt,
      );
    case 'debug-specialist':
      return createDebugSpecialistAgent(
        model,
        customPrompt,
        customAppendPrompt,
      );
    default:
      return undefined;
  }
}

/**
 * Create all agent definitions with optional per-agent model overrides.
 * When a model is not provided for an agent, it will inherit the user's currently selected model.
 */
export function createAgents(
  agentModels?: Record<string, string | undefined>,
  _options?: GetAgentConfigsOptions,
): AgentDefinition[] {
  const agents: AgentDefinition[] = [];

  for (const name of AGENT_NAMES) {
    const model = agentModels?.[name];
    const agent = createAgent(name, model);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

export interface GetAgentConfigsOptions {
  // No options currently.
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 * Pass agentModels to apply per-agent model overrides from flowdeck.json.
 */
export function getAgentConfigs(
  agentModels?: Record<string, string | undefined>,
  _options?: GetAgentConfigsOptions,
): Record<string, AgentConfig> {
  const agents = createAgents(agentModels);
  const configs: Record<string, AgentConfig> = {};

  for (const agent of agents) {
    let mode: 'primary' | 'subagent' | 'all' = 'subagent';
    if (isPrimaryAgent(agent.name)) {
      mode = 'primary';
    } else if (isAllModeAgent(agent.name)) {
      mode = 'all';
    }

    const hidden = isHiddenAgent(agent.name);

    configs[agent.name] = {
      ...agent.config,
      description: agent.description,
      mode,
      hidden,
    };
  }

  return configs;
}

/**
 * Build the canonical list of routing options from the compiled agent
 * registry. This is the single source of truth for "which agents exist
 * and what do they do" in default configuration. The orchestrator guard
 * receives this list and renders it into its block message.
 *
 * - Excludes `orchestrator` (the guard message must not route to the
 *   coordinator itself).
 * - Skips agents whose `description` is empty (defensive; the registry
 *   currently always provides one).
 * - Returns routes sorted by name for deterministic output.
 */
export function getAgentRoutes(): AgentRoute[] {
  const out: AgentRoute[] = []
  for (const name of AGENT_NAMES) {
    if (name === "orchestrator") continue
    const agent = createAgent(name)
    if (!agent) continue
    const desc = agent.description ?? ""
    if (!desc) continue
    out.push({ name, description: desc })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

// Export all agent factories for direct access
export {
  createOrchestratorAgent,
  createPlannerAgent,
  createArchitectAgent,
  createResearcherAgent,
  createMapperAgent,
  createBackendCoderAgent,
  createFrontendCoderAgent,
  createDevopsAgent,
  createTesterAgent,
  createReviewerAgent,
  createSecurityAuditorAgent,
  createDebugSpecialistAgent,
};
