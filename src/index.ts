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
import { notifyCommandInteraction, notifyPermissionNeeded } from "./hooks/notifications"
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

import { newProjectCommand } from "./commands/setup/new-project"
import { mapCodebaseCommand } from "./commands/setup/map-codebase"
import { settingsCommand } from "./commands/setup/settings"
import { doctorCommand } from "./commands/setup/doctor"
import { discussCommand } from "./commands/planning/discuss"
import { planCommand } from "./commands/planning/plan"
import { roadmapCommand } from "./commands/planning/roadmap"
import { dashboardCommand } from "./commands/planning/dashboard"
import { askCommand } from "./commands/planning/ask"
import { newFeatureCommand } from "./commands/execution/new-feature"
import { fixBugCommand } from "./commands/execution/fix-bug"
import { reviewCodeCommand } from "./commands/execution/review-code"
import { writeDocsCommand } from "./commands/execution/write-docs"
import { deployCheckCommand } from "./commands/execution/deploy-check"
import { progressCommand } from "./commands/state/progress"
import { resumeCommand } from "./commands/state/resume"
import { checkpointCommand } from "./commands/state/checkpoint"
import { workspaceCommands } from "./commands/state/workspace-commands"
import { multiRepoCommand } from "./commands/state/multi-repo"
import { impactRadarCommand } from "./commands/intelligence/impact-radar"
import { blastRadiusCommand } from "./commands/intelligence/blast-radius"
import { translateIntentCommand } from "./commands/intelligence/translate-intent"
import { volatilityMapCommand } from "./commands/intelligence/volatility-map-cmd"
import { regressionPredictCommand } from "./commands/intelligence/regression-predict"
import { testGapCommand } from "./commands/intelligence/test-gap"
import { reviewRouteCommand } from "./commands/intelligence/review-route"
import { analyzeChangeCommand } from "./commands/analysis/analyze-change"
import { guardedEditCommand } from "./commands/analysis/guarded-edit"
import { evaluateRiskCommand } from "./commands/analysis/evaluate-risk"
import { approveCommand } from "./commands/governance/approve"

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs || rawArgs.trim() === "") return {}
  try {
    return JSON.parse(rawArgs)
  } catch (err) {
    // Log warning but continue with fallback
    console.warn(`[flowdeck] Failed to parse command arguments as JSON: ${err instanceof Error ? err.message : String(err)}`)
    return { input: rawArgs }
  }
}

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

  const allCommands = [
    newProjectCommand,
    mapCodebaseCommand,
    settingsCommand,
    doctorCommand,
    discussCommand,
    planCommand,
    roadmapCommand,
    dashboardCommand,
    askCommand,
    newFeatureCommand,
    fixBugCommand,
    reviewCodeCommand,
    writeDocsCommand,
    deployCheckCommand,
    progressCommand,
    resumeCommand,
    checkpointCommand,
    ...workspaceCommands,
    multiRepoCommand,
    impactRadarCommand,
    blastRadiusCommand,
    translateIntentCommand,
    volatilityMapCommand,
    regressionPredictCommand,
    testGapCommand,
    reviewRouteCommand,
    // ── umbrella analysis commands ──────────────────────────────────────
    analyzeChangeCommand,
    guardedEditCommand,
    evaluateRiskCommand,
    // ── governance commands ──────────────────────────────────────────────
    approveCommand,
  ]

  const commandMap: Record<string, { execute(context: any, args?: any): Promise<any> }> = {}
  for (const cmd of allCommands) {
    commandMap[cmd.name] = cmd
  }

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

    "command.execute.before": async (cmdInput: any, output: any) => {
      const handler = commandMap[cmdInput.command]
      if (!handler) return
      try {
        const args = parseArgs(cmdInput.arguments)
        const result = await handler.execute({ directory }, args)
        const text = typeof result === "string"
          ? result
          : JSON.stringify(result, null, 2)
        output.parts.push({ type: "text", text })
        // Fire desktop notification after command result is ready (best-effort)
        notifyCommandInteraction(cmdInput.command)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        output.parts.push({ type: "text", text: `FlowDeck error: ${msg}` })
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

