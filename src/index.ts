import type { Plugin } from "@opencode-ai/plugin"
import { readdirSync, readFileSync, existsSync } from "fs"
import { join, basename } from "path"
import { dirname } from "path"
import { fileURLToPath } from "url"

function loadRulePaths(): string[] {
  const __dir = dirname(fileURLToPath(import.meta.url))
  const rulesDir = join(__dir, "..", "src", "rules")
  if (!existsSync(rulesDir)) return []

  const paths: string[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        paths.push(full)
      }
    }
  }
  walk(rulesDir)
  return paths
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
import { memorySearchTool } from "./tools/memory-search"
import { memoryStatusTool } from "./tools/memory-status"

import { memoryHook } from "./hooks/memory-hook"

import { guardRailsHook } from "./hooks/guard-rails"
import { toolGuardHook } from "./hooks/tool-guard"
import { sessionStartHook } from "./hooks/session-start"
import { notifyPermissionNeeded } from "./hooks/notifications"
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

import { getAgentConfigs } from "./agents/index"
import { loadFlowDeckConfig } from "./config/index"


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
      const agentModels: Record<string, string | undefined> = {}

      for (const [name, agentCfg] of Object.entries(flowdeckConfig.agents ?? {})) {
        if (agentCfg.model) {
          agentModels[name] = agentCfg.model
        }
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

      // Register FlowDeck rule files into instructions so OpenCode loads them
      const rulePaths = loadRulePaths()
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
      "memory-search": memorySearchTool,
      "memory-status": memoryStatusTool,
    },

    "shell.env": shellEnvHook,
    "todo.updated": todoHook,
    "file.edited": fileEdited,
    "file.watcher.updated": fileWatcherUpdated,
    "experimental.session.compacting": compactionHook,
    
    "permission.ask": async (input: Permission, _output: { status: "ask" | "deny" | "allow" }) => {
      notifyPermissionNeeded(input.title)
      // We don't auto-approve here; we just notify and let the standard OpenCode UI handle the prompt
    },

    event: async ({ event }: { event: any }) => {
      const type: string = event?.type ?? ""

      // Memory hook: session lifecycle
      try {
        if (type === "session.created" || type === "session.started") {
          const sessionId = event?.sessionID ?? event?.sessionId ?? ""
          if (sessionId) {
            memoryHook.onSessionCreated(directory, sessionId, event?.prompt)
          }
          await sessionStartHook({ directory })
        } else if (type === "message.updated") {
          const msgEvent = event?.event ?? event
          const sessionId = msgEvent?.sessionID ?? msgEvent?.sessionId ?? ""
          if (sessionId) {
            memoryHook.onMessageUpdated(sessionId, msgEvent.role, msgEvent.content, directory)
          }
        } else if (type === "session.compacted") {
          const compactEvent = event?.event ?? event
          const sessionId = compactEvent?.sessionID ?? compactEvent?.sessionId ?? ""
          if (sessionId) {
            memoryHook.onSessionCompact(sessionId, compactEvent.summary ?? "")
          }
        } else if (type === "session.deleted") {
          const delEvent = event?.event ?? event
          const sessionId = delEvent?.sessionID ?? delEvent?.sessionId ?? ""
          if (sessionId) {
            memoryHook.clearSession(sessionId)
          }
        }
      } catch (err) {
        // Silently handle memory hook errors to avoid breaking the plugin
        console.error("[FlowDeck Memory] Event handler error:", err)
      }

      // Dispatch to session monitor
      await contextMonitor.event({ event })
      // Let the orchestrator guard track the primary session ID
      orchestratorGuard.onEvent(event)

      if (type === "session.idle") {
        await sessionIdleHook()
        await autoLearnHook()
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
      await telemetryHook({ directory }, toolInput, toolOutput)
      await approvalHook({ directory }, toolInput, toolOutput)
      await guardRailsHook({ directory }, toolInput, toolOutput)
      await toolGuardHook({ directory }, toolInput, toolOutput)
      await patchTrustHook({ directory }, toolInput, toolOutput)
      await decisionTraceHook({ directory }, toolInput, toolOutput)
    },

    "tool.execute.after": async (toolInput: any, toolOutput: any) => {
      await telemetryAfterHook({ directory }, toolInput, toolOutput)
      // Memory hook: store tool observation
      try {
        const sessionId = toolInput?.sessionID ?? toolInput?.sessionId ?? ""
        if (sessionId && toolInput?.tool) {
          memoryHook.onToolExecuted(
            sessionId,
            toolInput.tool,
            toolInput,
            toolOutput?.output ?? null,
            directory
          )
        }
      } catch (err) {
        // Silently handle memory hook errors
        console.error("[FlowDeck Memory] Tool execution error:", err)
      }
      // Dispatch to context monitor
      await contextMonitor["tool.execute.after"](toolInput, toolOutput)
    }
  }
}

export default plugin
