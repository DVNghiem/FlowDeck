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

  const selection = selectRulePaths(rulesDir, { languages: detectedLanguages, projectRoot })
  const diagnostics = buildSelectionDiagnostics(selection, { languages: detectedLanguages, projectRoot })

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
import { reflectTool } from "./tools/reflect"
import { codegraphTool } from "./tools/codegraph-tool"
import { loadRulesTool, listRulesTool } from "./tools/load-rules"
import { mergeAssistTool } from "./tools/merge-assist"
import { createBackgroundAgentTool, createCheckBackgroundAgentTool, createListBackgroundAgentsTool } from "./tools/background-agent"
import { captureLessonTool, reviewLessonsTool } from "./tools/capture-lesson"

import { guardRailsHook } from "./hooks/guard-rails"
import { toolGuardHook, clearWriteCounter } from "./hooks/tool-guard"
import { sessionStartHook } from "./hooks/session-start"
import { notifyPermissionNeeded, NotificationController } from "./hooks/notifications"
import type { Permission } from "@opencode-ai/sdk"
import { patchTrustHook } from "./hooks/patch-trust"
import { createEventLogHooks } from "./hooks/event-log-hook"
import { LoopDetector } from "./services/loop-detector"

import { createContextWindowMonitorHook } from "./hooks/context-window-monitor"
import { createShellEnvHook } from "./hooks/shell-env-hook"
import { createTodoHook } from "./hooks/todo-hook"
import { SessionFileTracker, createFileTrackerHooks } from "./hooks/file-tracker"
import { createSessionIdleHook } from "./hooks/session-idle-hook"
import { OrchestratorGuard } from "./hooks/orchestrator-guard-hook"

import { getAgentConfigs } from "./agents/index"
import { loadFlowDeckConfig, resolveAgentModels, resolveDesignFirstConfig, type FlowDeckConfig } from "./config/index"
import { buildFlowDeckMcpsWithMeta } from "./mcp/index"

const IMPLEMENTATION_KEYWORDS = new Set([
  "implement", "fix", "refactor", "add", "delete", "write", "edit", "create",
  "build", "test", "feature", "bug", "code", "develop", "change", "update",
  "migrate", "deploy", "configure", "install", "remove", "rename", "extract",
])

function classifyCommand(command: string): { workflowClass: string; isTrivialChat: boolean } {
  const normalized = command.toLowerCase().trim()
  const words = normalized.split(/\s+/).filter(Boolean)
  const hasImplementationKeyword = words.some((w) => IMPLEMENTATION_KEYWORDS.has(w.replace(/[^a-z]/g, "")))
  const isGreeting = /^(hi|hello|hey|help|thanks|ok|goodbye|bye)(\s|$)/.test(normalized)
  const isTrivialChat = (isGreeting || normalized.length < 30) && !hasImplementationKeyword
  return {
    workflowClass: isTrivialChat ? "quick" : "standard",
    isTrivialChat,
  }
}

const plugin: Plugin = async (input, _options) => {
  const { directory, client, worktree } = input

  const appLog = (msg: string): Promise<void> =>
    client.app.log({ body: { service: "flowdeck", level: "info", message: msg } }).then(() => undefined).catch(() => {})

  // Mutable reference updated once flowdeckConfig is loaded in the config hook.
  let flowdeckConfig: FlowDeckConfig = loadFlowDeckConfig(directory)

  // Instantiate session-scoped file tracker for the hooks
  const fileTracker = new SessionFileTracker()
  const { fileEdited, fileWatcherUpdated } = createFileTrackerHooks(fileTracker)

  const contextMonitor = createContextWindowMonitorHook()
  const shellEnvHook = createShellEnvHook({ directory, worktree })
  const todoHook = createTodoHook(client)
  const sessionIdleHook = createSessionIdleHook(client, fileTracker)
  const orchestratorGuard = new OrchestratorGuard()

  // These are assigned inside the config hook once flowdeckConfig is loaded,
  // then captured by the tool.execute.before/after closures by reference.
  let loopDetector: LoopDetector | undefined
  let eventLog: ReturnType<typeof createEventLogHooks> | undefined

  // Notification controller — event-driven, fires only at meaningful lifecycle points
  const notifCtrl = new NotificationController(undefined, appLog)

  const agentConfigs = getAgentConfigs({})
  const { mcps, availability: mcpAvailability } = buildFlowDeckMcpsWithMeta()

  return {
    name: "@dv.nghiem/flowdeck",

    agent: agentConfigs,

    mcp: mcps,

    config: async (cfg: Record<string, unknown>) => {
      // Set default_agent if not already configured
      if (!(cfg as { default_agent?: string }).default_agent) {
        (cfg as { default_agent?: string }).default_agent = 'orchestrator'
      }

      flowdeckConfig = loadFlowDeckConfig(directory)
      const designFirstConfig = resolveDesignFirstConfig(flowdeckConfig)

      const agentModels = resolveAgentModels(flowdeckConfig)

      if (designFirstConfig.modelOverrides.design) {
        agentModels.design = designFirstConfig.modelOverrides.design
      }

      const resolvedAgentConfigs = getAgentConfigs(agentModels)

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
      "reflect": reflectTool,
      "codegraph": codegraphTool,
      "load-rules": loadRulesTool,
      "list-rules": listRulesTool,
      "merge-assist": mergeAssistTool,
      "background-agent": createBackgroundAgentTool(client, () => flowdeckConfig),
      "check-background-agent": createCheckBackgroundAgentTool(),
      "list-background-agents": createListBackgroundAgentsTool(),
      "capture-lesson": captureLessonTool,
      "review-lessons": reviewLessonsTool,
    },

    "shell.env": shellEnvHook,
    "todo.updated": todoHook,
    "file.edited": fileEdited,
    "file.watcher.updated": fileWatcherUpdated,

    "command.execute.before": async (input: { command: string; sessionID: string; arguments: string }, _output: any) => {
      const classification = classifyCommand(input.command)
      appLog(
        `[routing] run=${input.sessionID} command="${input.command}" ` +
          `workflow=${classification.workflowClass} trivial=${classification.isTrivialChat}`,
      )

      try {
        orchestratorGuard._setRoutingHintForTest({
          runId: input.sessionID,
          workflowClass: classification.workflowClass,
          isTrivialChat: classification.isTrivialChat,
          toolFamily: null,
          tokenOptimizationActive: true,
          readiness: {
            statePresent: false,
            stateFresh: false,
            codebaseIndexPresent: false,
            codegraphReady: false,
          },
          routeSignals: classification.isTrivialChat ? ["trivial-chat"] : ["implementation-intent"],
        })
      } catch (hintError) {
        // Hint propagation is best-effort.
        void hintError
      }
    },

    "permission.ask": async (input: Permission, _output: { status: "ask" | "deny" | "allow" }) => {
      notifyPermissionNeeded(input.title)
      // We don't auto-approve here; we just notify and let the standard OpenCode UI handle the prompt
    },

    event: async ({ event }: { event: any }) => {
      const type: string = event?.type ?? ""

      if (type === "session.created" || type === "session.started") {
        await sessionStartHook({ directory }, appLog)
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
        const sessionId =
          (event?.properties?.sessionID ?? event?.properties?.sessionId ?? event?.sessionID ?? "") as string

        // Fire the appropriate notification now that the agent is done
        notifCtrl.onSessionIdle(hasEdits)

        try {
          await sessionIdleHook()
        } finally {
          fileTracker.clear()
          clearWriteCounter(sessionId)
        }
      }

      // session.error: critical failure — always notify
      if (type === "session.error") {
        await eventLog!.session({ directory }, event)
        const err = event?.properties?.error
        const errorMsg: string =
          (err && typeof err === "object" && "message" in err ? String(err.message) : undefined) ??
          (typeof err === "string" ? err : undefined) ??
          "An unexpected error occurred"
        const sessionId =
          (event?.properties?.sessionID ?? event?.properties?.sessionId ?? event?.sessionID ?? "") as string
        clearWriteCounter(sessionId)
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

      orchestratorGuard.check(
        toolInput.sessionID ?? "",
        toolInput.tool ?? toolInput.name ?? "",
        toolOutput?.args ?? toolInput?.args,
      )

      // Surface the routing hint to downstream hooks via toolInput.metadata.
      try {
        const sessionId = toolInput.sessionID ?? ""
        const hint = orchestratorGuard.getRoutingHint(sessionId)
        if (hint) {
          toolInput.metadata = { ...(toolInput.metadata ?? {}), flowdeckRouting: hint }
        }
      } catch {
        // never block
      }

      await guardRailsHook({ directory }, toolInput, toolOutput)
      await toolGuardHook({ directory }, toolInput, toolOutput)
      await patchTrustHook({ directory }, toolInput, toolOutput)
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
