import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, readdirSync, existsSync } from "fs"
import { join, basename } from "path"
import { dirname } from "path"
import { fileURLToPath } from "url"

import {
  getStartupRulePaths,
  detectProjectLanguages,
  selectRulePaths,
  buildSelectionDiagnostics,
} from "./services/lazy-rule-loader"

/**
 * Lazily select rule file paths for injection into cfg.instructions.
 *
 * Selection policy:
 * - always_on rules → always injected (behavioral, agent-orchestration)
 * - Language-specific rules → only if language matches detected project language
 * - Stage-specific rules (coding-style, security, testing, git-workflow) → injected
 *   at startup since stage is not known at config time; agents can use load-rules
 *   tool for on-demand loading when entering a specific stage
 *
 * This eliminates foreign-language pattern files (e.g. Java/Go/Rust/Python rules
 * on a TypeScript project) and provides full metadata infrastructure for future
 * stage-based lazy loading via the load-rules tool.
 */
function lazyLoadRulePaths(projectRoot: string): { paths: string[]; diagnostics: string } {
  const __dir = dirname(fileURLToPath(import.meta.url))
  const rulesDir = join(__dir, "..", "src", "rules")
  if (!existsSync(rulesDir)) return { paths: [], diagnostics: "[LazyRuleLoader] rules directory not found" }

  const detectedLanguages = detectProjectLanguages(projectRoot)
  const paths = getStartupRulePaths(rulesDir, detectedLanguages)

  const selection = selectRulePaths(rulesDir, { languages: detectedLanguages })
  const diagnostics = buildSelectionDiagnostics(selection, { languages: detectedLanguages })

  return { paths, diagnostics }
}

function loadCommands(): Record<string, { description?: string; template: string }> {
  const __dir = dirname(fileURLToPath(import.meta.url))
  const commandsDir = join(__dir, "..", "src", "commands")
  if (!existsSync(commandsDir)) return {}

  const commands: Record<string, { description?: string; template: string }> = {}
  try {
    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith(".md")) continue
      const name = basename(file, ".md")
      const raw = readFileSync(join(commandsDir, file), "utf-8")
      let description: string | undefined
      let template = raw
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
      if (fmMatch) {
        template = fmMatch[2].trim()
        const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m)
        if (descMatch) description = descMatch[1].trim()
      }
      commands[name] = description ? { description, template } : { template }
    }
  } catch {
    // ignore
  }
  return commands
}

import { planningStateTool } from "./tools/planning-state"
import { codebaseStateTool } from "./tools/codebase-state"
import { workspaceStateTool } from "./tools/workspace-state"
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
import { createSkillTool } from "./tools/create-skill"
import { reflectTool } from "./tools/reflect"
import { codegraphTool } from "./tools/codegraph-tool"
import { loadRulesTool, listRulesTool } from "./tools/load-rules"
import { rtkSetupTool } from "./tools/rtk-setup"

import { guardRailsHook } from "./hooks/guard-rails"
import { toolGuardHook } from "./hooks/tool-guard"
import { sessionStartHook } from "./hooks/session-start"
import { notifyPermissionNeeded, NotificationController } from "./hooks/notifications"
import type { Permission } from "@opencode-ai/sdk"
import { patchTrustHook } from "./hooks/patch-trust"
import { decisionTraceHook } from "./hooks/decision-trace-hook"
import { telemetryHook, telemetryAfterHook } from "./hooks/telemetry-hook"
import { approvalHook } from "./hooks/approval-hook"

// NEW HOOKS
import { createContextWindowMonitorHook } from "./hooks/context-window-monitor"
import { createShellEnvHook } from "./hooks/shell-env-hook"
import { createTodoHook } from "./hooks/todo-hook"
import { SessionFileTracker, createFileTrackerHooks } from "./hooks/file-tracker"
import { createSessionIdleHook } from "./hooks/session-idle-hook"
import { createCompactionHook } from "./hooks/compaction-hook"
import { OrchestratorGuard } from "./hooks/orchestrator-guard-hook"
import { createAutoLearnHook } from "./hooks/auto-learn-hook"
import { createFlowDeckMcps } from "./mcp/index"
import { runSupervisorReview, resolveSupervisorConfig, shouldProceed } from "./services/supervisor-binding"

import { getAgentConfigs } from "./agents/index"
import { loadFlowDeckConfig, resolveDesignFirstConfig } from "./config/index"


const plugin: Plugin = async (input, _options) => {
  const { directory, client, worktree } = input

  // Instantiate runtime-integrated tools that need the OpenCode client
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
  const orchestratorGuard = new OrchestratorGuard()

  const appLog = (msg: string) =>
    client.app.log({ body: { service: "flowdeck", level: "info", message: msg } }).catch(() => {})
  const autoLearnHook = createAutoLearnHook(client, fileTracker, directory, appLog)

  // Notification controller — event-driven, fires only at meaningful lifecycle points
  const notifCtrl = new NotificationController(undefined, appLog)

  const agentConfigs = getAgentConfigs({})
  const mcps = createFlowDeckMcps()

  return {
    name: "@dv.nghiem/flowdeck",

    agent: agentConfigs,

    mcp: mcps,

    config: async (cfg: Record<string, unknown>) => {
      // Set default_agent if not already configured
      if (!(cfg as { default_agent?: string }).default_agent) {
        (cfg as { default_agent?: string }).default_agent = 'orchestrator'
      }

      const flowdeckConfig = loadFlowDeckConfig(directory)
      const designFirstConfig = resolveDesignFirstConfig(flowdeckConfig)
      const agentModels: Record<string, string | undefined> = {}

      for (const [name, agentCfg] of Object.entries(flowdeckConfig.agents ?? {})) {
        if (agentCfg.model) {
          agentModels[name] = agentCfg.model
        }
      }
      if (designFirstConfig.modelOverrides.design) {
        agentModels.design = designFirstConfig.modelOverrides.design
      }

      const resolvedAgentConfigs = getAgentConfigs(agentModels)

      // Per-agent shallow merge: plugin defaults first, user overrides win
      if (!cfg.agent) {
        cfg.agent = { ...resolvedAgentConfigs }
      } else {
        for (const [name, pluginAgent] of Object.entries(resolvedAgentConfigs)) {
          const existing = (cfg.agent as Record<string, unknown>)[name] as Record<string, unknown> | undefined
          if (existing) {
            (cfg.agent as Record<string, unknown>)[name] = { ...pluginAgent, ...existing }
          } else {
            (cfg.agent as Record<string, unknown>)[name] = { ...pluginAgent }
          }
        }
      }

      // Merge MCP configs into cfg.mcp
      const cfgMcp = cfg.mcp as Record<string, unknown> | undefined
      if (!cfgMcp) {
        cfg.mcp = { ...mcps }
      } else {
        Object.assign(cfgMcp, mcps)
      }

      // Register commands from src/commands/*.md
      const commands = loadCommands()
      if (Object.keys(commands).length > 0) {
        if (!cfg.command || typeof cfg.command !== 'object') {
          cfg.command = {}
        }
        for (const [name, cmd] of Object.entries(commands)) {
          if (!(cfg.command as Record<string, unknown>)[name]) {
            (cfg.command as Record<string, unknown>)[name] = cmd
          }
        }
      }

      // Register skills directory so opencode discovers FlowDeck skills
      const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "skills")
      if (existsSync(skillsDir)) {
        const cfgAny = cfg as Record<string, unknown>
        if (!cfgAny.skills || typeof cfgAny.skills !== 'object') {
          cfgAny.skills = { paths: [] }
        }
        const cfgSkills = cfgAny.skills as { paths?: string[] }
        if (!cfgSkills.paths) cfgSkills.paths = []
        if (!cfgSkills.paths.includes(skillsDir)) {
          cfgSkills.paths.push(skillsDir)
        }
      }

      // Lazily register FlowDeck rule files into cfg.instructions.
      // Only always_on rules + language-matching rules are injected at startup.
      // Stage-specific rules (coding-style, security, testing, git-workflow) are
      // available on-demand via the load-rules tool.
      const { paths: rulePaths, diagnostics: rulesDiag } = lazyLoadRulePaths(directory)
      appLog(rulesDiag)
      if (rulePaths.length > 0) {
        if (!Array.isArray(cfg.instructions)) {
          cfg.instructions = []
        }
        const existing = new Set(cfg.instructions as string[])
        for (const p of rulePaths) {
          if (!existing.has(p)) {
            (cfg.instructions as string[]).push(p)
          }
        }
      }
    },

    tool: {
      "planning-state": planningStateTool,
      "codebase-state": codebaseStateTool,
      "workspace-state": workspaceStateTool,
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
      "create-skill": createSkillTool,
      "reflect": reflectTool,
      "codegraph": codegraphTool,
      "load-rules": loadRulesTool,
      "list-rules": listRulesTool,
      "rtk-setup": rtkSetupTool,
    },

    "shell.env": shellEnvHook,
    "todo.updated": todoHook,
    "file.edited": fileEdited,
    "file.watcher.updated": fileWatcherUpdated,
    "experimental.session.compacting": compactionHook,

    "command.execute.before": async (_input: { command: string; sessionID: string; arguments: string }, _output: any) => {
      // Do NOT notify here — command has only been entered, not completed.
      // Notifications are sent by NotificationController when session.idle or
      // session.error fires (i.e. after the agent has actually finished processing).
    },
    
    "permission.ask": async (input: Permission, _output: { status: "ask" | "deny" | "allow" }) => {
      notifyPermissionNeeded(input.title)
      // We don't auto-approve here; we just notify and let the standard OpenCode UI handle the prompt
    },

    event: async ({ event }: { event: any }) => {
      const type: string = event?.type ?? ""

      if (type === "session.created" || type === "session.started") {
        await sessionStartHook({ directory })
      }

      // command.executed fires AFTER the command has been dispatched into the session
      // (but before the agent produces its response). Record it so the next session.idle
      // can fire the right notification.
      if (type === "command.executed") {
        const commandName: string = event?.properties?.name ?? ""
        if (commandName) {
          notifCtrl.onCommandExecuted(commandName)
        }
      }

      // Dispatch to session monitor
      await contextMonitor.event({ event })
      // Let the orchestrator guard track the primary session ID
      orchestratorGuard.onEvent(event)

      if (type === "session.idle") {
        const hasEdits = fileTracker.getEditedPaths().length > 0
        // Fire the appropriate notification now that the agent is done
        notifCtrl.onSessionIdle(hasEdits)

        try {
          await sessionIdleHook()
          await autoLearnHook()
        } finally {
          fileTracker.clear()
        }
      }

      // session.error: critical failure — always notify
      if (type === "session.error") {
        const err = event?.properties?.error
        const errorMsg: string =
          (err && typeof err === "object" && "message" in err ? String(err.message) : undefined) ??
          (typeof err === "string" ? err : undefined) ??
          "An unexpected error occurred"
        notifCtrl.onSessionError(errorMsg)
      }
    },

    "tool.execute.before": async (toolInput: any, toolOutput: any) => {
      // Coerce string numeric args to numbers for the read tool (e.g. offset: "1.0" → 1)
      if ((toolInput.tool === "read" || toolInput.tool === "view") && toolOutput?.args) {
        if (typeof toolOutput.args.offset === "string") {
          const n = Number(toolOutput.args.offset)
          if (!isNaN(n)) toolOutput.args.offset = Math.floor(n)
        }
        if (Array.isArray(toolOutput.args.view_range)) {
          toolOutput.args.view_range = toolOutput.args.view_range.map((v: unknown) =>
            typeof v === "string" ? Math.floor(Number(v)) : v
          )
        }
      }

      // Enforce orchestrator delegation before running any hook logic
      orchestratorGuard.check(toolInput.sessionID ?? "", toolInput.tool ?? toolInput.name ?? "")

      // Supervisor preflight review: intercept delegate/run-pipeline calls when supervisor is enabled
      const toolName = toolInput.tool ?? toolInput.name ?? ""
      if (toolName === "delegate" || toolName === "run-pipeline") {
        const supConfig = resolveSupervisorConfig(directory)
        if (supConfig.enabled) {
          // Extract agent name from delegate args or first step of run-pipeline
          const args = toolOutput?.args ?? toolInput?.args ?? {}
          const agentTarget: string =
            typeof args.agent === "string"
              ? args.agent.replace(/^@/, "")
              : Array.isArray(args.steps) && args.steps[0]?.agent
              ? String(args.steps[0].agent).replace(/^@/, "")
              : ""

          if (agentTarget) {
            const decision = runSupervisorReview(directory, agentTarget, {
              taskDescription: typeof args.prompt === "string" ? args.prompt : undefined,
              reviewPhase: "preflight",
              session_id: toolInput.sessionID ?? toolInput.sessionId ?? "",
            })

            const proceed = shouldProceed(decision, supConfig.mode, supConfig.canBlock)

            appLog(
              `[Supervisor] ${decision.reviewPhase} review of "${decision.targetName}": ` +
              `decision=${decision.decision} exists=${decision.exists} confidence=${decision.confidenceScore.toFixed(2)} ` +
              `${decision.riskFlags.length > 0 ? `risks=[${decision.riskFlags.join("; ")}]` : ""}`
            )

            if (!proceed) {
              const summary = [
                `[Supervisor] Execution blocked for target "${decision.targetName}".`,
                ...decision.reasons,
                ...(decision.missingRequirements.length > 0
                  ? [`Missing: ${decision.missingRequirements.join(", ")}`]
                  : []),
                ...(decision.requiredChanges.length > 0
                  ? [`Required changes: ${decision.requiredChanges.join("; ")}`]
                  : []),
              ].join("\n")
              throw new Error(summary)
            }
          }
        }
      }

      await telemetryHook({ directory }, toolInput, toolOutput)
      await approvalHook({ directory }, toolInput, toolOutput)
      await guardRailsHook({ directory }, toolInput, toolOutput)
      await toolGuardHook({ directory }, toolInput, toolOutput)
      await patchTrustHook({ directory }, toolInput, toolOutput)
      await decisionTraceHook({ directory }, toolInput, toolOutput)
    },

    "tool.execute.after": async (toolInput: any, toolOutput: any) => {
      await telemetryAfterHook({ directory }, toolInput, toolOutput)

      // Supervisor post-execution review
      const afterToolName = toolInput.tool ?? toolInput.name ?? ""
      if (afterToolName === "delegate" || afterToolName === "run-pipeline") {
        try {
          const supConfig = resolveSupervisorConfig(directory)
          if (supConfig.enabled && supConfig.postExecutionReview) {
            const args = toolOutput?.args ?? toolInput?.args ?? {}
            const agentTarget: string =
              typeof args.agent === "string"
                ? args.agent.replace(/^@/, "")
                : Array.isArray(args.steps) && args.steps[0]?.agent
                ? String(args.steps[0].agent).replace(/^@/, "")
                : ""

            if (agentTarget) {
              // Determine execution outcome from toolOutput
              const executionErrored =
                toolOutput?.error != null ||
                toolOutput?.status === "error" ||
                (typeof toolOutput?.output === "string" && toolOutput.output.startsWith("Error:"))

              const decision = runSupervisorReview(directory, agentTarget, {
                taskDescription: typeof args.prompt === "string" ? args.prompt : undefined,
                reviewPhase: "post-stage",
                session_id: toolInput.sessionID ?? toolInput.sessionId ?? "",
                // Surface execution errors as a risk context
                prerequisitesMet: !executionErrored,
              })

              // Post-execution: always log, never throw (execution already completed)
              const logLevel =
                decision.decision === "block" || decision.decision === "escalate"
                  ? "[Supervisor][WARN]"
                  : "[Supervisor]"

              appLog(
                `${logLevel} post-stage review of "${decision.targetName}": ` +
                `decision=${decision.decision} exists=${decision.exists} confidence=${decision.confidenceScore.toFixed(2)} ` +
                `executionErrored=${executionErrored} ` +
                `${decision.riskFlags.length > 0 ? `risks=[${decision.riskFlags.join("; ")}]` : ""}`
              )

              // In strict mode, a post-execution block signals a governance violation for audit
              if (supConfig.mode === "strict" && !shouldProceed(decision, "strict", supConfig.canBlock)) {
                appLog(
                  `[Supervisor][STRICT] Post-execution governance violation detected for "${decision.targetName}". ` +
                  `Review the scorecard and telemetry for this run. ` +
                  `Reasons: ${decision.reasons.join("; ")}`
                )
              }
            }
          }
        } catch {
          // Post-execution review must never break the plugin
        }
      }

      // Dispatch to context monitor
      await contextMonitor["tool.execute.after"](toolInput, toolOutput)
    }
  }
}

export default plugin
