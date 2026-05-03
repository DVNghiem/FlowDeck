import type { Plugin, PluginModule } from "@opencode-ai/plugin"

import { planningStateTool } from "./tools/planning-state"
import { codebaseStateTool } from "./tools/codebase-state"
import { workspaceStateTool } from "./tools/workspace-state"
import { createRunParallelTool } from "./tools/run-parallel"
import { createRunPipelineTool } from "./tools/run-pipeline"
import { createDelegateTool } from "./tools/delegate"
import { repoMemoryTool } from "./tools/repo-memory"
import { failureReplayTool } from "./tools/failure-replay"
import { decisionTraceTool } from "./tools/decision-trace"
import { volatilityMapTool } from "./tools/volatility-map"
import { policyEngineTool } from "./tools/policy-engine"
import { hashEditTool } from "./tools/hash-edit"
import { createCouncilTool } from "./tools/council"
import { contextGeneratorTool } from "./tools/context-generator"

import { guardRailsHook } from "./hooks/guard-rails"
import { toolGuardHook } from "./hooks/tool-guard"
import { sessionStartHook } from "./hooks/session-start"
import { notifyPermissionNeeded } from "./hooks/notifications"
import { patchTrustHook } from "./hooks/patch-trust"
import { decisionTraceHook } from "./hooks/decision-trace-hook"
import { telemetryHook } from "./hooks/telemetry-hook"
import { approvalHook } from "./hooks/approval-hook"

// NEW HOOKS
import { createContextWindowMonitorHook } from "./hooks/context-window-monitor"
import { createShellEnvHook } from "./hooks/shell-env-hook"
import { createTodoHook } from "./hooks/todo-hook"
import { SessionFileTracker, createFileTrackerHooks } from "./hooks/file-tracker"
import { createSessionIdleHook } from "./hooks/session-idle-hook"
import { createCompactionHook } from "./hooks/compaction-hook"
import { createFlowDeckMcps } from "./mcp/index"


const server: Plugin = async (input, _options) => {
  const { directory, client, worktree } = input

  // Instantiate runtime-integrated tools that need the OpenCode client
  const runParallelTool = createRunParallelTool(client)
  const runPipelineTool = createRunPipelineTool(client)
  const delegateTool = createDelegateTool(client)
  const councilTool = createCouncilTool(client)

  // Instantiate session-scoped file tracker for the hooks
  const fileTracker = new SessionFileTracker()
  const { fileEdited, fileWatcherUpdated } = createFileTrackerHooks(fileTracker)
  
  const contextMonitor = createContextWindowMonitorHook()
  const shellEnvHook = createShellEnvHook({ directory, worktree })
  const todoHook = createTodoHook(client)
  const sessionIdleHook = createSessionIdleHook(client, fileTracker)
  const compactionHook = createCompactionHook({ directory }, fileTracker)

  return {
    mcp: createFlowDeckMcps(),

    tool: {
      "planning-state": planningStateTool,
      "codebase-state": codebaseStateTool,
      "workspace-state": workspaceStateTool,
      "run-parallel": runParallelTool,
      "run-pipeline": runPipelineTool,
      "delegate": delegateTool,
      "repo-memory": repoMemoryTool,
      "failure-replay": failureReplayTool,
      "decision-trace": decisionTraceTool,
      "volatility-map": volatilityMapTool,
      "policy-engine": policyEngineTool,
      "hash-edit": hashEditTool,
      "council": councilTool,
      "context-generator": contextGeneratorTool,
    },

    "shell.env": shellEnvHook,
    "todo.updated": todoHook,
    "file.edited": fileEdited,
    "file.watcher.updated": fileWatcherUpdated,
    "experimental.session.compacting": compactionHook,
    
    "permission.ask": async (event: any) => {
      notifyPermissionNeeded(event.tool)
      // We don't auto-approve here; we just notify and let the standard OpenCode UI handle the prompt
      return undefined 
    },

    event: async ({ event }: { event: any }) => {
      const type: string = event?.type ?? ""
      
      // Dispatch to session monitor
      await contextMonitor.event({ event })

      if (type === "session.created" || type === "session.started") {
        await sessionStartHook({ directory })
      } else if (type === "session.idle") {
        await sessionIdleHook()
      }
    },

    "tool.execute.before": async (toolInput: any, toolOutput: any) => {
      await telemetryHook({ directory }, toolInput, toolOutput)
      await approvalHook({ directory }, toolInput, toolOutput)
      await guardRailsHook({ directory }, toolInput, toolOutput)
      await toolGuardHook({ directory }, toolInput, toolOutput)
      await patchTrustHook({ directory }, toolInput, toolOutput)
      await decisionTraceHook({ directory }, toolInput, toolOutput)
    },

    "tool.execute.after": async (toolInput: any, toolOutput: any) => {
      // Dispatch to context monitor
      await contextMonitor["tool.execute.after"](toolInput, toolOutput)
    }
  }
}

const plugin: PluginModule = {
  id: "@dv.nghiem/flowdeck",
  server,
}

export default plugin

