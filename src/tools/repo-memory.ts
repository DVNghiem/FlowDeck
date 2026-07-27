import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "./codebase-state"

const MEMORY_FILE = "MEMORY.json"

export interface MemoryNode {
  id: string
  type: "module" | "service" | "api" | "schema" | "config"
  path: string
  owner?: string
  tags: string[]
  dependencies: string[]
  dependents: string[]
  bug_history: string[]
  conventions: string[]
  last_updated: string
}

export interface RepoMemory {
  version: string
  last_updated: string
  nodes: Record<string, MemoryNode>
}

function memoryPath(directory: string): string {
  return join(codebaseDir(directory), MEMORY_FILE)
}

function emptyMemory(): RepoMemory {
  return { version: "1.0", last_updated: new Date().toISOString(), nodes: {} }
}

function readMemory(directory: string): RepoMemory {
  const p = memoryPath(directory)
  if (!existsSync(p)) return emptyMemory()
  try {
    return JSON.parse(readFileSync(p, "utf-8"))
  } catch {
    return emptyMemory()
  }
}

function writeMemory(directory: string, memory: RepoMemory): void {
  const base = codebaseDir(directory)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  memory.last_updated = new Date().toISOString()
  writeFileSync(memoryPath(directory), JSON.stringify(memory, null, 2), "utf-8")
}

export const repoMemoryTool: ToolDefinition = tool({
  description: "Repo Memory Graph: read/write/query persistent architecture graph in `~/.fd-plan/<slug>/.codebase/MEMORY.json` (modules, dependencies, ownership, bug history, conventions)",
  args: {
    action: tool.schema.enum(["read", "write_node", "query", "delete_node"]),
    node_id: tool.schema.string().optional(),
    node: tool.schema.object({
      type: tool.schema.enum(["module", "service", "api", "schema", "config"]),
      path: tool.schema.string(),
      owner: tool.schema.string().optional(),
      tags: tool.schema.array(tool.schema.string()),
      dependencies: tool.schema.array(tool.schema.string()),
      dependents: tool.schema.array(tool.schema.string()),
      bug_history: tool.schema.array(tool.schema.string()),
      conventions: tool.schema.array(tool.schema.string()),
    }).optional(),
    query: tool.schema.object({
      type: tool.schema.enum(["module", "service", "api", "schema", "config"]).optional(),
      owner: tool.schema.string().optional(),
      tag: tool.schema.string().optional(),
      path_prefix: tool.schema.string().optional(),
    }).optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const memory = readMemory(dir)

    switch (args.action) {
      case "read": {
        if (args.node_id) {
          const node = memory.nodes[args.node_id]
          return JSON.stringify(node ?? { error: `Node not found: ${args.node_id}` })
        }
        return JSON.stringify({ nodes: Object.keys(memory.nodes), last_updated: memory.last_updated })
      }

      case "write_node": {
        if (!args.node_id || !args.node) {
          return JSON.stringify({ error: "node_id and node required" })
        }
        memory.nodes[args.node_id] = {
          id: args.node_id,
          ...args.node,
          last_updated: new Date().toISOString(),
        }
        writeMemory(dir, memory)
        return JSON.stringify({ success: true, node_id: args.node_id })
      }

      case "query": {
        const q = args.query ?? {}
        const results = Object.values(memory.nodes).filter(node => {
          if (q.type && node.type !== q.type) return false
          if (q.owner && node.owner !== q.owner) return false
          if (q.tag && !node.tags.includes(q.tag)) return false
          if (q.path_prefix && !node.path.startsWith(q.path_prefix)) return false
          return true
        })
        return JSON.stringify({ count: results.length, nodes: results })
      }

      case "delete_node": {
        if (!args.node_id) return JSON.stringify({ error: "node_id required" })
        if (!memory.nodes[args.node_id]) return JSON.stringify({ error: `Node not found: ${args.node_id}` })
        delete memory.nodes[args.node_id]
        writeMemory(dir, memory)
        return JSON.stringify({ success: true, deleted: args.node_id })
      }
    }
  },
})
