import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import {
  isCodegraphInstalled,
  isCodegraphIndexed,
  readCodegraphMeta,
  isCodegraphFresh,
  installCodegraph,
  initCodegraphIndex,
  refreshCodegraphIndex,
  markCodegraphStale,
  hasChangedSinceLastIndex,
} from "../services/codegraph"

export const codegraphTool: ToolDefinition = tool({
  description:
    "Manage codegraph code intelligence layer: detect installation, initialize or refresh the code index, query status. " +
    "When .codegraph/ exists agents should prefer codegraph MCP tools (codegraph_context, codegraph_explore, codegraph_search, " +
    "codegraph_callers, codegraph_callees, codegraph_impact, codegraph_trace) over direct file exploration.",
  args: {
    action: tool.schema.enum(["check", "install", "init", "refresh", "status", "mark-stale"]),
    agent: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const agent = args.agent ?? "codegraph-tool"

    switch (args.action) {
      case "check": {
        const installed = isCodegraphInstalled()
        const indexed = isCodegraphIndexed(dir)
        const meta = readCodegraphMeta(dir)
        const fresh = isCodegraphFresh(dir)
        const changed = hasChangedSinceLastIndex(dir)
        return JSON.stringify({
          installed,
          indexed,
          fresh,
          hasChangedSinceLastIndex: changed,
          lastIndexedAt: meta.lastIndexedAt,
          lastIndexedRevision: meta.lastIndexedRevision,
          freshnessStatus: meta.freshnessStatus,
          recommendation: !installed
            ? "run action=install then action=init"
            : !indexed
            ? "run action=init to build the code index"
            : !fresh || changed
            ? "run action=refresh to update the stale index"
            : "codegraph index is fresh — use codegraph MCP tools directly",
        })
      }

      case "install": {
        const result = installCodegraph()
        return JSON.stringify({
          ...result,
          note: result.success && !result.alreadyInstalled
            ? "codegraph installed. Run action=init to build the project index."
            : result.alreadyInstalled
            ? "codegraph was already installed."
            : `Install failed: ${result.error}`,
        })
      }

      case "init": {
        const result = initCodegraphIndex(dir, agent)
        return JSON.stringify({
          ...result,
          note: result.success
            ? `codegraph index built (${result.full ? "full" : "incremental"}). ` +
              `codegraph MCP tools are now available for code understanding.`
            : `codegraph init failed: ${result.error}`,
        })
      }

      case "refresh": {
        const result = refreshCodegraphIndex(dir, agent)
        return JSON.stringify({
          ...result,
          note: result.success
            ? `codegraph index refreshed. Changed files since last index: ${result.changedFiles.length}`
            : `codegraph refresh failed: ${result.error}`,
        })
      }

      case "status": {
        const installed = isCodegraphInstalled()
        const indexed = isCodegraphIndexed(dir)
        const meta = readCodegraphMeta(dir)
        const fresh = isCodegraphFresh(dir)
        return JSON.stringify({
          installed,
          indexed,
          fresh,
          meta,
          mcp: {
            available: installed && indexed,
            tools: [
              "codegraph_context",
              "codegraph_trace",
              "codegraph_explore",
              "codegraph_search",
              "codegraph_callers",
              "codegraph_callees",
              "codegraph_impact",
              "codegraph_node",
              "codegraph_status",
              "codegraph_files",
            ],
            guidance:
              installed && indexed
                ? "Use codegraph MCP tools for code understanding. Prefer over file exploration."
                : "codegraph not ready. Run action=init first.",
          },
        })
      }

      case "mark-stale": {
        markCodegraphStale(dir)
        return JSON.stringify({ success: true, message: "codegraph index marked stale — next init will do a full rebuild" })
      }
    }
  },
})
