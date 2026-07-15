/**
 * Agent delegation runtime for FlowDeck v1 pipeline.
 * Abstracts agent execution so tests can inject mocks.
 *
 * Architecture note: FlowDeck runs as a plugin inside the OpenCode host's
 * agent loop. The plugin has no direct access to the session ID needed to
 * fork sub-agent sessions via the SDK. ProdAgentRuntime delegates through
 * the orchestrator LLM loop instead — see Phase 2 for direct SDK delegation.
 */

import { createExplorerAgent } from "../agents/explorer"
import { createResearcherAgent } from "../agents/researcher"
import { createArchitectAgent } from "../agents/architect"
import { createDesignerAgent } from "../agents/designer"
import { createPlannerAgent } from "../agents/planner"
import type { AgentDefinition } from "../types/agent"
import type { ContextPacket } from "./context-packet"
import { formatContextPacket } from "./context-packet"

// ── Factory registry ─────────────────────────────────────────────────────────

const AGENT_FACTORIES: Record<string, (model?: string) => AgentDefinition> = {
  explorer: createExplorerAgent,
  researcher: createResearcherAgent,
  architect: createArchitectAgent,
  designer: createDesignerAgent,
  planner: createPlannerAgent,
}

/**
 * Look up an agent factory by name.
 * Returns null if the agent is not registered.
 */
function getAgentDefinition(name: string): AgentDefinition | null {
  const factory = AGENT_FACTORIES[name]
  return factory ? factory() : null
}

// ── Result types ────────────────────────────────────────────────────────────────

export interface AgentDelegationOptions {
  contextPacket?: ContextPacket
  maxTokens?: number
  temperature?: number
}

export interface AgentExecutionResult {
  agentName: string
  output: string
  tokensUsed?: number
  error?: string
}

// ── Abstract runtime ───────────────────────────────────────────────────────────

/**
 * Abstract agent runtime — clients call this, tests mock it.
 */
export abstract class AgentRuntime {
  abstract delegate(
    agentName: string,
    userMessage: string,
    options?: AgentDelegationOptions
  ): Promise<AgentExecutionResult>
}

// ── Production runtime ─────────────────────────────────────────────────────────

/**
 * Production runtime — delegates through the orchestrator LLM loop.
 *
 * Phase 1: OpenCode plugin architecture does not expose a `sessionID`
 * to fork sub-agent sessions via the SDK. Instead, we write task artifacts
 * to disk and let the orchestrator (the LLM running the session) drive the
 * pipeline by reading those files and taking action.
 *
 * Phase 2: Wire session.fork() once a CLI entrypoint (not plugin) has
 * access to the active session ID from the SDK client.
 */
export class ProdAgentRuntime extends AgentRuntime {
  private directory: string

  constructor(directory: string) {
    super()
    this.directory = directory
  }

  async delegate(
    agentName: string,
    userMessage: string,
    options?: AgentDelegationOptions
  ): Promise<AgentExecutionResult> {
    const agent = getAgentDefinition(agentName)
    if (!agent) {
      return { agentName, output: "", error: `Agent not found: ${agentName}` }
    }

    // Build full message with injected context
    let fullMessage = userMessage
    if (options?.contextPacket) {
      fullMessage = injectContextIntoMessage(userMessage, options.contextPacket)
    }

    // Phase 1: SDK sub-agent delegation requires session.fork() + session.prompt()
    // which needs a sessionID we don't have in plugin context.
    // Phase 2 will wire this via createOpencodeClient({ directory }) and
    // session.fork() → session.prompt() → session.wait() → session.messages().
    void agent
    void fullMessage
    void options
    return {
      agentName,
      output: "",
      error:
        `[fd-task Phase 1] Sub-agent delegation requires session ID. ` +
        `Configure Phase 2: createOpencodeClient({ directory: "${this.directory}" }) ` +
        `→ session.fork() → session.prompt() → session.wait() → session.messages().`,
    }
  }
}

// ── Mock runtime ────────────────────────────────────────────────────────────────

/**
 * Mock runtime for testing — returns pre-configured responses.
 */
export class MockAgentRuntime extends AgentRuntime {
  private responses: Map<string, string> = new Map()
  private errors: Map<string, string> = new Map()

  /**
   * Set a mock output for an agent. Clears any previously set error.
   */
  setMockResponse(agentName: string, output: string): void {
    this.responses.set(agentName, output)
    this.errors.delete(agentName)
  }

  /**
   * Set a mock error for an agent. Clears any previously set response.
   */
  setMockError(agentName: string, error: string): void {
    this.errors.set(agentName, error)
    this.responses.delete(agentName)
  }

  async delegate(
    agentName: string,
    _userMessage: string,
    _options?: AgentDelegationOptions
  ): Promise<AgentExecutionResult> {
    const error = this.errors.get(agentName)
    if (error) {
      return { agentName, output: "", error }
    }

    const output = this.responses.get(agentName)
    if (!output) {
      return {
        agentName,
        output: "",
        error: `No mock response configured for agent: ${agentName}`,
      }
    }

    return { agentName, output, tokensUsed: 0 }
  }
}

// ── Global runtime ──────────────────────────────────────────────────────────────

/** Global agent runtime — replaced by tests via setAgentRuntime(). */
export let globalAgentRuntime: AgentRuntime = new ProdAgentRuntime(process.cwd())

/** Replace the global runtime (used by tests to inject MockAgentRuntime). */
export function setAgentRuntime(runtime: AgentRuntime): void {
  globalAgentRuntime = runtime
}

/** Re-initialize the global runtime with a specific directory (call at startup). */
export function initAgentRuntime(directory: string): void {
  globalAgentRuntime = new ProdAgentRuntime(directory)
}

/** Get the current global runtime (exported for test assertions). */
export function getAgentRuntime(): AgentRuntime {
  return globalAgentRuntime
}

/**
 * Delegate to an agent via the global runtime.
 * Primary entry point for fd-task pipeline.
 */
export async function delegateToAgent(
  agentName: string,
  userMessage: string,
  options?: AgentDelegationOptions
): Promise<AgentExecutionResult> {
  return globalAgentRuntime.delegate(agentName, userMessage, options)
}

// ── Context injection ─────────────────────────────────────────────────────────

/**
 * Prepend formatted context packet to a user message.
 */
function injectContextIntoMessage(message: string, packet: ContextPacket): string {
  const ctx = formatContextPacket(packet)
  return `${ctx}\n\n---\n\n${message}`
}
