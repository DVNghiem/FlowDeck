import type { Plugin } from "@opencode-ai/plugin"
import { onSessionStart, onSessionEnd } from "./hooks/session"
import { checkOrchestratorTool } from "./hooks/guard"

// Placeholder for fdx integration — kept from v0.6
// Phase 2+ will expand with actual agent definitions
const fdxTools = {}

const plugin: Plugin = async ({ directory }: { directory: string }) => {
  return {
    agent: {},

    tools: fdxTools,

    "tool.execute.before": async (toolInput: any) => {
      const toolName = String(toolInput?.tool ?? toolInput?.name ?? "")
      const agentName = toolInput?.agent ?? undefined
      const result = checkOrchestratorTool(toolName, agentName)
      if (!result.allowed) {
        throw new Error(`[FlowDeck Guard] ${result.reason}`)
      }
    },

    event: async ({ event }: { event: any }) => {
      const type = event?.type ?? ""
      if (type === "session.created" || type === "session.started") {
        await onSessionStart({ directory })
      }
      if (type === "session.idle" || type === "session.ended") {
        await onSessionEnd({ directory })
      }
    },
  }
}

export default plugin
