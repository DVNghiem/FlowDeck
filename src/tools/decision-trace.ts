import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "./codebase-state"

const DECISIONS_FILE = "DECISIONS.jsonl"

export interface DecisionEntry {
  id: string
  timestamp: string
  session_id?: string
  file_path: string
  change_type: "create" | "edit" | "delete" | "refactor"
  rationale: string
  evidence: string[]
  assumptions: string[]
  alternatives_considered: string[]
  risk_level: "low" | "medium" | "high"
  agent?: string
}

function decisionsPath(directory: string): string {
  return join(codebaseDir(directory), DECISIONS_FILE)
}

function readDecisions(directory: string): DecisionEntry[] {
  const p = decisionsPath(directory)
  if (!existsSync(p)) return []
  return readFileSync(p, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
}

/**
 * Append a decision entry to `.codebase/DECISIONS.jsonl` from non-tool code
 * (e.g. the plugin's command.execute.before hook). Idempotent: creates the
 * directory if missing. Returns the entry that was written.
 *
 * Used to record the runtime routing/tool-selection decision so it is visible
 * to the orchestrator, the default-executor, and any downstream agents
 * inspecting the decision trace — not just printed to the application log.
 */
export function appendDecision(directory: string, entry: Omit<DecisionEntry, "timestamp"> & { timestamp?: string }): DecisionEntry {
  const base = codebaseDir(directory)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  const full: DecisionEntry = { ...entry, timestamp: entry.timestamp ?? new Date().toISOString() }
  appendFileSync(decisionsPath(directory), JSON.stringify(full) + "\n", "utf-8")
  return full
}

export const decisionTraceTool: ToolDefinition = tool({
  description: "Decision Trace: record why the agent changed something, what evidence was used, and assumptions made. Stored in .codebase/DECISIONS.jsonl for fast review.",
  args: {
    action: tool.schema.enum(["record", "query", "get_for_file"]),
    entry: tool.schema.object({
      id: tool.schema.string(),
      file_path: tool.schema.string(),
      change_type: tool.schema.enum(["create", "edit", "delete", "refactor"]),
      rationale: tool.schema.string(),
      evidence: tool.schema.array(tool.schema.string()),
      assumptions: tool.schema.array(tool.schema.string()),
      alternatives_considered: tool.schema.array(tool.schema.string()),
      risk_level: tool.schema.enum(["low", "medium", "high"]),
      agent: tool.schema.string().optional(),
      session_id: tool.schema.string().optional(),
    }).optional(),
    query: tool.schema.object({
      file_path: tool.schema.string().optional(),
      change_type: tool.schema.enum(["create", "edit", "delete", "refactor"]).optional(),
      risk_level: tool.schema.enum(["low", "medium", "high"]).optional(),
      limit: tool.schema.number().optional(),
    }).optional(),
    file_path: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const base = codebaseDir(dir)

    switch (args.action) {
      case "record": {
        if (!args.entry) return JSON.stringify({ error: "entry required" })
        if (!existsSync(base)) mkdirSync(base, { recursive: true })
        const entry: DecisionEntry = { ...args.entry, timestamp: new Date().toISOString() }
        appendFileSync(decisionsPath(dir), JSON.stringify(entry) + "\n", "utf-8")
        return JSON.stringify({ success: true, id: args.entry.id })
      }

      case "query": {
        const q = args.query ?? {}
        let entries = readDecisions(dir).filter(e => {
          if (q.file_path && !e.file_path.includes(q.file_path)) return false
          if (q.change_type && e.change_type !== q.change_type) return false
          if (q.risk_level && e.risk_level !== q.risk_level) return false
          return true
        })
        // Return most recent first
        entries = entries.reverse()
        if (q.limit) entries = entries.slice(0, q.limit)
        return JSON.stringify({ count: entries.length, entries })
      }

      case "get_for_file": {
        if (!args.file_path) return JSON.stringify({ error: "file_path required" })
        const entries = readDecisions(dir)
          .filter(e => e.file_path === args.file_path || e.file_path.endsWith(args.file_path!))
          .reverse()
        return JSON.stringify({ count: entries.length, entries })
      }
    }
  },
})
