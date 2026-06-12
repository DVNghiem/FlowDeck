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
import { repoMemoryTool } from "./tools/repo-memory"
import { failureReplayTool } from "./tools/failure-replay"
import { decisionTraceTool } from "./tools/decision-trace"
import { policyEngineTool } from "./tools/policy-engine"
import { hashEditTool } from "./tools/hash-edit"
import { createCouncilTool } from "./tools/council"
import { reflectTool } from "./tools/reflect"
import { codegraphTool } from "./tools/codegraph-tool"
import { loadRulesTool, listRulesTool } from "./tools/load-rules"
import { mergeAssistTool } from "./tools/merge-assist"

import { guardRailsHook } from "./hooks/guard-rails"
import { toolGuardHook } from "./hooks/tool-guard"
import { sessionStartHook } from "./hooks/session-start"
import { notifyPermissionNeeded, NotificationController } from "./hooks/notifications"
import type { Permission } from "@opencode-ai/sdk"
import { patchTrustHook } from "./hooks/patch-trust"
import { decisionTraceHook } from "./hooks/decision-trace-hook"
import { approvalHook } from "./hooks/approval-hook"
import { createEventLogHooks } from "./hooks/event-log-hook"
import { LoopDetector } from "./services/loop-detector"

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

import { getAgentConfigs } from "./agents/index"
import { loadFlowDeckConfig, resolveDesignFirstConfig } from "./config/index"
import { createContextIngressService } from "./services/context-ingress"
import type { AssembledContext } from "./services/harness-types"


const plugin: Plugin = async (input, _options) => {
  const { directory, client, worktree } = input

  const appLog = (msg: string) =>
    client.app.log({ body: { service: "flowdeck", level: "info", message: msg } }).catch(() => {})

  // Instantiate runtime-integrated tools that need the OpenCode client
  const councilTool = createCouncilTool(client)

  // Instantiate session-scoped file tracker for the hooks
  const fileTracker = new SessionFileTracker()
  const { fileEdited, fileWatcherUpdated } = createFileTrackerHooks(fileTracker)

  const contextIngress = createContextIngressService()
  let assembledContext: AssembledContext | undefined

  const contextMonitor = createContextWindowMonitorHook()
  const shellEnvHook = createShellEnvHook({ directory, worktree })
  const todoHook = createTodoHook(client)
  const sessionIdleHook = createSessionIdleHook(client, fileTracker)
  const compactionHook = createCompactionHook({ directory }, fileTracker)
  const orchestratorGuard = new OrchestratorGuard()

  const autoLearnHook = createAutoLearnHook(client, fileTracker, directory, appLog)

  // These are assigned inside the config hook once flowdeckConfig is loaded,
  // then captured by the tool.execute.before/after closures by reference.
  let loopDetector: LoopDetector | undefined
  let eventLog: ReturnType<typeof createEventLogHooks> | undefined

  // Notification controller — event-driven, fires only at meaningful lifecycle points
  const notifCtrl = new NotificationController(undefined, appLog)

  const agentConfigs = getAgentConfigs({})
  const mcps = createFlowDeckMcps()

  let lastExecutedCommand: string | null = null

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

      const loopCfg = (flowdeckConfig as any).governance?.loopDetection ?? {}
      loopDetector = new LoopDetector(
        {
          enabled: loopCfg.enabled ?? true,
          maxRepeats: loopCfg.maxRepeats ?? 2,
          similarityThreshold: loopCfg.similarityThreshold ?? 0.9,
          historySize: loopCfg.historySize ?? 20,
        },
        appLog
      )

      eventLog = createEventLogHooks(appLog, (toolName, args, output, sessionId, status) => {
        loopDetector?.recordAfter(toolName, args, output, sessionId, status as "success" | "error" | "blocked")
      })

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
      "repo-memory": repoMemoryTool,
      "failure-replay": failureReplayTool,
      "decision-trace": decisionTraceTool,
      "policy-engine": policyEngineTool,
      "hash-edit": hashEditTool,
      "council": councilTool,
      "reflect": reflectTool,
      "codegraph": codegraphTool,
      "load-rules": loadRulesTool,
      "list-rules": listRulesTool,
      "merge-assist": mergeAssistTool,
    },

    "shell.env": shellEnvHook,
    "todo.updated": todoHook,
    "file.edited": fileEdited,
    "file.watcher.updated": fileWatcherUpdated,
    "experimental.session.compacting": compactionHook,

    "command.execute.before": async (input: { command: string; sessionID: string; arguments: string }, _output: any) => {
      lastExecutedCommand = input.command
      // Assemble context for the run. Advisory only: logged but does not alter behavior.
      try {
        assembledContext = contextIngress.assemble({
          runId: input.sessionID,
          sessionId: input.sessionID,
          projectRoot: directory,
          description: `${input.command} ${input.arguments ?? ""}`.trim(),
          config: loadFlowDeckConfig(directory),
        })
        const budget = assembledContext.tokenBudget
        appLog(
          `[context-ingress] run=${input.sessionID} trivial=${assembledContext.isTrivialChat} ` +
            `tokens=${budget.usedTokens}/${budget.totalTokens} (${budget.percentUsed}%)`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        appLog(`[context-ingress] failed to assemble context: ${message}`)
      }
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
        if (type === "session.created") {
          await eventLog!.session({ directory }, event)
        }
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
        await eventLog!.session({ directory }, event)
        const hasEdits = fileTracker.getEditedPaths().length > 0
        // Surface command completion toast before firing notification
        if (lastExecutedCommand) {
          lastExecutedCommand = null
        }
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
        await eventLog!.session({ directory }, event)
        lastExecutedCommand = null
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

      orchestratorGuard.check(toolInput.sessionID ?? "", toolInput.tool ?? toolInput.name ?? "")

      await approvalHook({ directory }, toolInput, toolOutput)
      await guardRailsHook({ directory }, toolInput, toolOutput)
      await toolGuardHook({ directory }, toolInput, toolOutput)
      await patchTrustHook({ directory }, toolInput, toolOutput)
      await decisionTraceHook({ directory }, toolInput, toolOutput)
      await eventLog!.before({ directory }, toolInput, toolOutput)

      const loopResult = loopDetector!.checkBefore(
        toolInput.tool ?? toolInput.name ?? "unknown",
        toolOutput?.args ?? toolInput?.args ?? {},
        toolInput.sessionID ?? ""
      )
      if (loopResult.action === "block") {
        throw new Error(loopResult.escalationMessage)
      }
      if (loopResult.action === "warn") {
        appLog(loopResult.message)
      }
    },

    "tool.execute.after": async (toolInput: any, toolOutput: any) => {
      const eventLogHealthy = await eventLog!.after({ directory }, toolInput, toolOutput)
      if (!eventLogHealthy) {
        loopDetector!.setPersistenceHealthy(false)
      }

      // Dispatch to context monitor
      await contextMonitor["tool.execute.after"](toolInput, toolOutput)
    }
  }
}

export default plugin
