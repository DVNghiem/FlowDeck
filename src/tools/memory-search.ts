import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import {
  searchObservations,
  getRecentSessions,
  getObservationsForSession,
  getSessionSummary,
} from "../services/memory-store"

export const memorySearchTool: ToolDefinition = tool({
  description: "Search FlowDeck memory for past observations, sessions, and context. Use to recall what was worked on previously.",
  args: {
    query: tool.schema.string().optional().describe("Search query for memory (searches tool names, inputs, and outputs)"),
    session_id: tool.schema.string().optional().describe("Specific session ID to retrieve observations from"),
    limit: tool.schema.number().optional().describe("Maximum number of results (default: 10)"),
  },
  async execute(args, context): Promise<string> {
    const directory = context.directory ?? process.cwd()
    const limit = args.limit ?? 10

    if (args.session_id) {
      const sessions = getRecentSessions(directory, 100)
      const targetSession = sessions.find(
        (s) => String(s.id) === args.session_id || s.content_session_id === args.session_id
      )

      if (!targetSession) {
        return JSON.stringify({ error: "Session not found", session_id: args.session_id })
      }

      const observations = getObservationsForSession(targetSession.id!)
      const summary = getSessionSummary(targetSession.id!)
      return JSON.stringify({
        session: targetSession,
        summary: summary
          ? {
              content: summary.content,
              metadata: summary.metadata,
              created_at: summary.created_at,
            }
          : null,
        observations: observations.map((o) => ({
          tool_name: o.tool_name,
          tool_input: o.tool_input,
          tool_response: o.tool_response ? o.tool_response.slice(0, 500) + (o.tool_response.length > 500 ? "..." : "") : null,
          created_at: o.created_at,
        })),
      })
    }

    if (args.query) {
      const results = searchObservations(directory, args.query, limit)

      if (results.length === 0) {
        return JSON.stringify({ message: `No results found for "${args.query}"`, results: [] })
      }

      return JSON.stringify({
        query: args.query,
        count: results.length,
        results: results.map(({ observation, session }) => ({
          tool_name: observation.tool_name,
          tool_input: observation.tool_input,
          tool_response: observation.tool_response ? observation.tool_response.slice(0, 300) + (observation.tool_response.length > 300 ? "..." : "") : null,
          project: session.project,
          date: observation.created_at,
        })),
      })
    }

    const sessions = getRecentSessions(directory, limit)

    if (sessions.length === 0) {
      return JSON.stringify({ message: "No previous sessions found in this directory", sessions: [] })
    }

    return JSON.stringify({
      message: "Recent sessions",
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        content_session_id: s.content_session_id,
        project: s.project,
        created_at: s.created_at,
        last_active_at: s.last_active_at,
        summary: s.summary,
      })),
    })
  },
})