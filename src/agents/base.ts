/**
 * Agent base types for FlowDeck.
 *
 * AgentDefinition + AgentFactory: canonical source is src/types/agent.ts.
 * AgentConfig: defined here because it extends the SDK type with `system`
 * (fdx-first tool guidance) which is FlowDeck-specific.
 */
export type { AgentDefinition, AgentFactory } from "../types/agent"

import type { AgentConfig as SdkAgentConfig } from "@opencode-ai/sdk/v2"

/**
 * FlowDeck agent config — extends the SDK AgentConfig with `system`
 * for fdx-first tool guidance injected into the system prompt.
 */
export interface AgentConfig extends SdkAgentConfig {
  system?: string
}

/**
 * Build the fdx-first tool guidance block injected into every agent prompt.
 * Agents try fdx tools first, fall back to native only on fdx error.
 */
export function fdxToolGuidance(): string {
  return `
## Tool Usage
Always try fdx tools first. Fall back to native read/grep/glob ONLY if fdx errors or returns empty.
- File structure: fdx-outline, fdx-tree
- Read file: fdx-read --mode prototype (structure) or --mode deep --symbol <name> (specific function)
- Search: fdx-search, fdx-grep
- Multi-file: fdx-batch
- Impact: fdx-impact
- Git context: fdx-git log, fdx-git status

If the task description begins with \`## Orchestrator Context\`, treat it as ground truth. Do NOT re-research what is already there.
`.trim()
}
