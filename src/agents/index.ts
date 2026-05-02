import type { AgentConfig } from '@opencode-ai/sdk/v2';

import type { AgentDefinition, AgentFactory } from './types';

export { resolvePrompt } from './types';
export type { AgentDefinition, AgentFactory } from './types';

// Import all agent factories
import { createOrchestratorAgent } from './orchestrator';
import { createPlannerAgent } from './planner';
import { createCoderAgent } from './coder';
import {
  createFlowdeckPlannerAgent,
  createFlowdeckExecutorAgent,
  createFlowdeckPlanCheckerAgent,
} from './flowdeck';
import { createTesterAgent } from './tester';
import { createReviewerAgent } from './reviewer';
import { createResearcherAgent } from './researcher';
import { createWriterAgent } from './writer';
import { createSecurityAuditorAgent } from './security-auditor';
import { createDocUpdaterAgent } from './doc-updater';
import { createMapperAgent } from './mapper';
import { createCodeExplorerAgent } from './code-explorer';
import { createDebugSpecialistAgent, createBuildErrorResolverAgent } from './debug';
import {
  createTaskSplitterAgent,
  createDiscusserAgent,
  createParallelCoordinatorAgent,
} from './specialist';
import { createArchitectAgent } from './architect';
import { createRiskAnalystAgent } from './risk-analyst';
import { createPolicyEnforcerAgent } from './policy-enforcer';
import {
  createPerformanceOptimizerAgent,
  createRefactorGuideAgent,
} from './performance';

// Default models for each agent
export const DEFAULT_MODELS: Record<string, string> = {
  orchestrator: 'anthropic/claude-sonnet-4-5',
  planner: 'anthropic/claude-opus-4-5',
  coder: 'anthropic/claude-opus-4-5',
  'flowdeck-planner': 'anthropic/claude-sonnet-4-5',
  'flowdeck-executor': 'anthropic/claude-sonnet-4-5',
  'flowdeck-plan-checker': 'anthropic/claude-sonnet-4-5',
  tester: 'anthropic/claude-haiku-4-5',
  reviewer: 'google/gemini-2.5-flash',
  researcher: 'openai/gpt-4o',
  writer: 'anthropic/claude-haiku-4-5',
  'security-auditor': 'anthropic/claude-sonnet-4-5',
  'doc-updater': 'anthropic/claude-sonnet-4-5',
  mapper: 'google/gemini-2.5-flash',
  'code-explorer': 'anthropic/claude-haiku-4-5',
  'debug-specialist': 'anthropic/claude-sonnet-4-5',
  'build-error-resolver': 'anthropic/claude-sonnet-4-5',
  'task-splitter': 'anthropic/claude-sonnet-4-5',
  discusser: 'anthropic/claude-sonnet-4-5',
  'parallel-coordinator': 'anthropic/claude-sonnet-4-5',
  architect: 'anthropic/claude-opus-4-5',
  'risk-analyst': 'anthropic/claude-sonnet-4-5',
  'policy-enforcer': 'anthropic/claude-sonnet-4-5',
  'performance-optimizer': 'anthropic/claude-sonnet-4-5',
  'refactor-guide': 'anthropic/claude-sonnet-4-5',
};

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
 * Create a single agent by name with optional custom prompts
 */
export function createAgent(
  name: string,
  model?: string,
  customPrompt?: string,
  customAppendPrompt?: string,
): AgentDefinition | undefined {
  const modelOrDefault = model ?? DEFAULT_MODELS[name] ?? 'anthropic/claude-sonnet-4-5';

  switch (name) {
    case 'orchestrator':
      return createOrchestratorAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'planner':
      return createPlannerAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'coder':
      return createCoderAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'flowdeck-planner':
      return createFlowdeckPlannerAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'flowdeck-executor':
      return createFlowdeckExecutorAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'flowdeck-plan-checker':
      return createFlowdeckPlanCheckerAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'tester':
      return createTesterAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'reviewer':
      return createReviewerAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'researcher':
      return createResearcherAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'writer':
      return createWriterAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'security-auditor':
      return createSecurityAuditorAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'doc-updater':
      return createDocUpdaterAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'mapper':
      return createMapperAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'code-explorer':
      return createCodeExplorerAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'debug-specialist':
      return createDebugSpecialistAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'build-error-resolver':
      return createBuildErrorResolverAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'task-splitter':
      return createTaskSplitterAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'discusser':
      return createDiscusserAgent(modelOrDefault, customPrompt, customAppendPrompt);
    case 'parallel-coordinator':
      return createParallelCoordinatorAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'architect':
      return createArchitectAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'risk-analyst':
      return createRiskAnalystAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'policy-enforcer':
      return createPolicyEnforcerAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'performance-optimizer':
      return createPerformanceOptimizerAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    case 'refactor-guide':
      return createRefactorGuideAgent(
        modelOrDefault,
        customPrompt,
        customAppendPrompt,
      );
    default:
      console.warn(`[flowdeck] Unknown agent: ${name}`);
      return undefined;
  }
}

/**
 * Create all agent definitions
 */
export function createAgents(): AgentDefinition[] {
  const agentNames = Object.keys(DEFAULT_MODELS);
  const agents: AgentDefinition[] = [];

  for (const name of agentNames) {
    const agent = createAgent(name);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Get agent configurations formatted for the OpenCode SDK
 */
export function getAgentConfigs(): Record<string, AgentConfig> {
  const agents = createAgents();
  const configs: Record<string, AgentConfig> = {};

  for (const agent of agents) {
    // Determine mode based on agent classification
    let mode: 'primary' | 'subagent' | 'all' = 'subagent';
    if (isPrimaryAgent(agent.name)) {
      mode = 'primary';
    } else if (isAllModeAgent(agent.name)) {
      mode = 'all';
    }

    // Check if agent should be hidden
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

// Export all agent factories for direct access
export {
  createOrchestratorAgent,
  createPlannerAgent,
  createCoderAgent,
  createFlowdeckPlannerAgent,
  createFlowdeckExecutorAgent,
  createFlowdeckPlanCheckerAgent,
  createTesterAgent,
  createReviewerAgent,
  createResearcherAgent,
  createWriterAgent,
  createSecurityAuditorAgent,
  createDocUpdaterAgent,
  createMapperAgent,
  createCodeExplorerAgent,
  createDebugSpecialistAgent,
  createBuildErrorResolverAgent,
  createTaskSplitterAgent,
  createDiscusserAgent,
  createParallelCoordinatorAgent,
  createArchitectAgent,
  createRiskAnalystAgent,
  createPolicyEnforcerAgent,
  createPerformanceOptimizerAgent,
  createRefactorGuideAgent,
};