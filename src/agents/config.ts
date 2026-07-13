import type { AgentConfig } from "@opencode-ai/sdk/v2"
import type { AgentDefinition } from "./base"
import { createExplorerAgent } from "./explorer"
import { createResearcherAgent } from "./researcher"
import { createArchitectAgent } from "./architect"
import { createDesignerAgent } from "./designer"
import { createPlannerAgent } from "./planner"
import { createBackendCoderAgent } from "./backend-coder"
import { createFrontendCoderAgent } from "./frontend-coder"
import { createDevOpsCoderAgent } from "./devops-coder"
import { createReviewerAgent } from "./reviewer"

const AGENT_FACTORIES: Record<string, (model?: string) => AgentDefinition> = {
  explorer: createExplorerAgent,
  researcher: createResearcherAgent,
  architect: createArchitectAgent,
  designer: createDesignerAgent,
  planner: createPlannerAgent,
  "backend-coder": createBackendCoderAgent,
  "frontend-coder": createFrontendCoderAgent,
  "devops-coder": createDevOpsCoderAgent,
  reviewer: createReviewerAgent,
}

const PRIMARY_AGENTS = new Set(["explorer", "planner", "backend-coder", "frontend-coder", "devops-coder", "reviewer"])
const ALL_MODE_AGENTS = new Set<string>([])
const HIDDEN_AGENTS = new Set<string>([])

/** Check if agent is a primary (user-facing) agent */
export function isPrimaryAgent(agentName: string): boolean {
  return PRIMARY_AGENTS.has(agentName)
}

/** Check if agent should operate in 'all' mode */
export function isAllModeAgent(agentName: string): boolean {
  return ALL_MODE_AGENTS.has(agentName)
}

/** Check if agent should be hidden from user */
export function isHiddenAgent(agentName: string): boolean {
  return HIDDEN_AGENTS.has(agentName)
}

/** Create all agents with optional model overrides */
export function createAgents(
  agentModels?: Record<string, string | undefined>
): AgentDefinition[] {
  return Object.entries(AGENT_FACTORIES).map(([name, factory]) => {
    const model = agentModels?.[name]
    return factory(model)
  })
}

/** Get all agent configs for plugin registration */
export function getAgentConfigs(
  agentModels?: Record<string, string | undefined>
): Record<string, AgentConfig> {
  const agents = createAgents(agentModels)
  const configs: Record<string, AgentConfig> = {}

  for (const agent of agents) {
    let mode: "primary" | "subagent" | "all" = "subagent"
    if (isPrimaryAgent(agent.name)) {
      mode = "primary"
    } else if (isAllModeAgent(agent.name)) {
      mode = "all"
    }

    const hidden = isHiddenAgent(agent.name)

    configs[agent.name] = {
      ...agent.config,
      description: agent.description,
      mode,
      hidden,
    }
  }

  return configs
}
