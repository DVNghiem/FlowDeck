import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync, readdirSync } from "fs"
import { basename, dirname, join } from "path"
import { fileURLToPath } from "url"

import {
  buildSelectionDiagnostics,
  detectProjectLanguages,
  getStartupRulePaths,
  selectRulePaths,
} from "../services/lazy-rule-loader"
import { LoopDetector } from "../services/loop-detector"

import { getAgentConfigs, getAgentRoutes } from "../agents/index"
import { loadFlowDeckConfig, resolveAgentModels, type FlowDeckConfig } from "../config/index"
import { guardRailsHook } from "../hooks/guard-rails"
import { OrchestratorGuard } from "../hooks/orchestrator-guard-hook"
import { sessionStartHook } from "../hooks/session-start"
import { sessionEventsHook } from "../hooks/session-events"
import { toolGuardHook } from "../hooks/tool-guard"
import { buildFlowDeckMcpsWithMeta } from "../mcp/index"
import { captureLessonTool, reviewLessonsTool } from "../tools/capture-lesson"
import { codegraphTool } from "../tools/codegraph-tool"
import { codebaseStateTool } from "../tools/codebase-state"
import {
  fdxBatchTool,
  fdxDiffTool,
  fdxGitTool,
  fdxGrepTool,
  fdxImpactTool,
  fdxLintTool,
  fdxLsTool,
  fdxOutlineTool,
  fdxReadTool,
  fdxSearchTool,
  fdxTestTool,
  fdxTreeTool,
} from "../tools/fdx"
import { failureReplayTool } from "../tools/failure-replay"
import { hashEditTool } from "../tools/hash-edit"
import { loadRulesTool, listRulesTool } from "../tools/load-rules"
import { mergeAssistTool } from "../tools/merge-assist"
import { planningStateTool } from "../tools/planning-state"
import { policyEngineTool } from "../tools/policy-engine"
import { repoMemoryTool } from "../tools/repo-memory"

const __dir = dirname(fileURLToPath(import.meta.url))

/** Select FlowDeck rule paths for cfg.instructions injection (Step 4 will swap for a leaner loader). */
function lazyLoadRulePaths(projectRoot: string): { paths: string[]; diagnostics: string } {
  // Probe two candidates: running from dist/plugin/ (.., ..) or src/plugin/ (..)
  const candidates = [
    join(__dir, "..", "..", "src", "rules"), // dist/plugin/ -> src/rules
    join(__dir, "..", "src", "rules"),       // src/plugin/  -> src/rules
  ]
  const rulesDir = candidates.find(existsSync)
  if (!rulesDir) return { paths: [], diagnostics: "[LazyRuleLoader] rules directory not found" }
  const detected = detectProjectLanguages(projectRoot)
  const paths = getStartupRulePaths(rulesDir, detected)
  const selection = selectRulePaths(rulesDir, { languages: detected, projectRoot })
  return { paths, diagnostics: buildSelectionDiagnostics(selection, { languages: detected, projectRoot }) }
}

/** Load FlowDeck slash commands from src/commands/*.md (parses frontmatter description). */
function loadCommands(): Record<string, { description?: string; template: string }> {
  const dir = join(__dir, "..", "..", "src", "commands")
  if (!existsSync(dir)) return {}
  const out: Record<string, { description?: string; template: string }> = {}
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue
      const raw = readFileSync(join(dir, file), "utf-8")
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
      const template = fm ? fm[2].trim() : raw
      const desc = fm?.[1].match(/^description:\s*(.+)$/m)?.[1].trim()
      out[basename(file, ".md")] = desc ? { description: desc, template } : { template }
    }
  } catch { /* ignore */ }
  return out
}

const plugin: Plugin = async ({ directory, client }) => {
  const appLog = (msg: string): Promise<void> =>
    client.app.log({ body: { service: "flowdeck", level: "info", message: msg } })
      .then(() => undefined).catch(() => {})

  let flowdeckConfig: FlowDeckConfig = loadFlowDeckConfig(directory)
  const orchestratorGuard = new OrchestratorGuard({ routes: getAgentRoutes() })
  const loopDetector = new LoopDetector(undefined, appLog)

  const { mcps } = buildFlowDeckMcpsWithMeta()

  return {
    name: "@dv.nghiem/flowdeck",
    agent: {},
    mcp: mcps,

    config: async (cfg: Record<string, unknown>) => {
      if (!(cfg as { default_agent?: string }).default_agent) {
        (cfg as { default_agent?: string }).default_agent = "orchestrator"
      }

      flowdeckConfig = loadFlowDeckConfig(directory)
      const resolvedAgents = getAgentConfigs(resolveAgentModels(flowdeckConfig))

      // Per-agent shallow merge: plugin defaults first, user overrides win.
      if (!cfg.agent) {
        cfg.agent = { ...resolvedAgents }
      } else {
        const existing = cfg.agent as Record<string, unknown>
        for (const [name, def] of Object.entries(resolvedAgents)) {
          existing[name] = existing[name] ? { ...def, ...existing[name] } : { ...def }
        }
      }

      const cfgMcp = cfg.mcp as Record<string, unknown> | undefined
      if (cfgMcp) Object.assign(cfgMcp, mcps)
      else cfg.mcp = { ...mcps }

      const commands = loadCommands()
      if (Object.keys(commands).length > 0) {
        if (!cfg.command || typeof cfg.command !== "object") cfg.command = {}
        const cfgCmd = cfg.command as Record<string, unknown>
        for (const [name, cmd] of Object.entries(commands)) {
          if (!cfgCmd[name]) cfgCmd[name] = cmd
        }
      }

      const skillsDir = join(__dir, "..", "..", "src", "skills")
      if (existsSync(skillsDir)) {
        const cfgAny = cfg as Record<string, unknown>
        const skills = (cfgAny.skills && typeof cfgAny.skills === "object" ? cfgAny.skills : { paths: [] }) as { paths?: string[] }
        if (!skills.paths) skills.paths = []
        if (!skills.paths.includes(skillsDir)) skills.paths.push(skillsDir)
        cfgAny.skills = skills
      }

      const { paths: rulePaths, diagnostics } = lazyLoadRulePaths(directory)
      appLog(diagnostics)
      if (rulePaths.length > 0) {
        if (!Array.isArray(cfg.instructions)) cfg.instructions = []
        const seen = new Set(cfg.instructions as string[])
        for (const p of rulePaths) if (!seen.has(p)) (cfg.instructions as string[]).push(p)
      }
    },

    tool: {
      "planning-state": planningStateTool,
      "codebase-state": codebaseStateTool,
      "repo-memory": repoMemoryTool,
      "failure-replay": failureReplayTool,
      "policy-engine": policyEngineTool,
      "hash-edit": hashEditTool,
      "codegraph": codegraphTool,
      "load-rules": loadRulesTool,
      "list-rules": listRulesTool,
      "merge-assist": mergeAssistTool,
      "capture-lesson": captureLessonTool,
      "review-lessons": reviewLessonsTool,
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
    },

    "tool.execute.before": async (toolInput: any, toolOutput: any) => {
      // Orchestrator deny-by-default — orchestrator cannot write or shell-exec on the primary session.
      // Non-orchestrator agents are exempt; they are governed solely by toolGuardHook.
      orchestratorGuard.check(
        toolInput.sessionID ?? "",
        toolInput.tool ?? toolInput.name ?? "",
        toolOutput?.args ?? toolInput?.args,
        toolInput.agent,
      )
      // Planning-phase guard rails (FLOWDECK_GUARD_RAILS_ENABLED=on).
      await guardRailsHook({ directory }, toolInput, toolOutput)
      // Tool guard (FLOWDECK_TOOL_GUARD_ENABLED=on) — blocks dangerous ops, enforces
      // architectural constraints and per-agent write limits.
      await toolGuardHook({ directory }, toolInput, toolOutput)
      const loop = loopDetector.checkBefore(
        toolInput.tool ?? toolInput.name ?? "unknown",
        toolOutput?.args ?? toolInput?.args ?? {},
        toolInput.sessionID ?? "",
      )
      if (loop.action === "block") throw new Error(loop.escalationMessage)
      if (loop.action === "warn") appLog(loop.message)
    },

    "tool.execute.after": async (toolInput: any) => {
      appLog(`[tool] done tool=${toolInput.tool ?? toolInput.name ?? "unknown"} session=${toolInput.sessionID ?? ""}`)
      // SDK's tool.execute.after only exposes toolInput (toolOutput is unavailable here).
      // Pass a sentinel for output so call-count tracking still works; if the SDK
      // includes output on toolInput, prefer it for hash-based loop detection.
      loopDetector.recordAfter(
        toolInput.tool ?? toolInput.name ?? "unknown",
        toolInput.args ?? {},
        toolInput.output ?? "[unavailable]",
        toolInput.sessionID ?? "",
      )
    },

    event: async ({ event }: { event: any }) => {
      const type: string = event?.type ?? ""
      if (type === "session.created" || type === "session.started") {
        const taskDescription =
          event?.properties?.task ??
          event?.properties?.message ??
          event?.properties?.input ??
          ""
        await sessionStartHook({ directory }, appLog, taskDescription)
      } else if (type === "session.idle" || type === "session.error") {
        const sessionID = event?.properties?.sessionID ?? ""
        await sessionEventsHook({ directory }, type === "session.idle" ? "idle" : "error", sessionID)
      }
      orchestratorGuard.onEvent(event)
    },
  }
}

export default plugin
