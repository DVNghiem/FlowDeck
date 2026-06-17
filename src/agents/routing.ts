/**
 * Routing types shared by the agent registry and the orchestrator guard.
 *
 * The guard renders an `AgentRoute` per built-in agent so the orchestrator
 * can see the available specialists in the block message. The registry
 * exposes the route list via `getAgentRoutes()` in `src/agents/index.ts`.
 */

export interface AgentRoute {
  name: string
  description: string
}
