import type { Plugin } from "@opencode-ai/plugin"
import { onSessionStart, onSessionEnd } from "./hooks/session"
import { checkOrchestratorTool } from "./hooks/guard"
import { checkTddGuard, recordStepWrite } from "./hooks/tdd-guard"
import { getAgentConfigs } from "./agents/config"
import { createOrchestratorAgent } from "./agents/orchestrator"
import {
  fdxReadTool,
  fdxSearchTool,
  fdxGrepTool,
  fdxBatchTool,
  fdxImpactTool,
  fdxOutlineTool,
  fdxDiffTool,
  fdxGitTool,
  fdxLsTool,
  fdxTreeTool,
  fdxTestTool,
  fdxLintTool,
} from "./tools/fdx"

const fdxTools = {
  "fdx-read": fdxReadTool,
  "fdx-search": fdxSearchTool,
  "fdx-grep": fdxGrepTool,
  "fdx-batch": fdxBatchTool,
  "fdx-impact": fdxImpactTool,
  "fdx-outline": fdxOutlineTool,
  "fdx-diff": fdxDiffTool,
  "fdx-git": fdxGitTool,
  "fdx-ls": fdxLsTool,
  "fdx-tree": fdxTreeTool,
  "fdx-test": fdxTestTool,
  "fdx-lint": fdxLintTool,
}

const TDD_GUARDED_AGENTS = new Set([
  "backend-coder",
  "frontend-coder",
  "devops-coder",
])

const plugin: Plugin = async ({ directory }: { directory: string }) => {
  return {
    agent: getAgentConfigs(),

    tools: fdxTools,

    "tool.execute.before": async (toolInput: any) => {
      const toolName = String(toolInput?.tool ?? toolInput?.name ?? "")
      const agentName = toolInput?.agent ?? undefined
      const result = checkOrchestratorTool(toolName, agentName)
      if (!result.allowed) {
        throw new Error(`[FlowDeck Guard] ${result.reason}`)
      }

      if (typeof agentName === "string" && TDD_GUARDED_AGENTS.has(agentName)) {
        const args = (toolInput?.args ?? {}) as Record<string, unknown>
        const stepId =
          (args.stepId as string | undefined) ??
          (args.step_id as string | undefined) ??
          toolInput?.sessionID ??
          "default"
        const filePath =
          (args.filePath as string | undefined) ??
          (args.file_path as string | undefined) ??
          (args.path as string | undefined)
        if (typeof filePath === "string" && filePath.length > 0) {
          const tdd = checkTddGuard(stepId, filePath, true)
          if (!tdd.allowed) {
            throw new Error(tdd.reason ?? "[TDD Guard] write blocked")
          }
          recordStepWrite(stepId, filePath)
        }
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
