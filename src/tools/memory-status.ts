import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { getRecentSessions, getSessionSummary, getDbSettings, getObservationsForSession } from "../services/memory-store"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

function resolveDbPath(): string {
  return join(process.env.FLOWDECK_MEMORY_DIR ?? join(homedir(), ".flowdeck-memory"), "memory.db")
}

export const memoryStatusTool: ToolDefinition = tool({
  description: "Check FlowDeck memory database status, statistics, and recent sessions",
  args: {},
  async execute(_args, context) {
    const directory = (context as unknown as { directory?: string })?.directory ?? process.cwd()
    const dbPath = resolveDbPath()

    try {
      const exists = existsSync(dbPath)

      if (!exists) {
        return JSON.stringify(
          {
            database_exists: false,
            path: dbPath,
            status: "NOT_INITIALIZED",
          },
          null,
          2
        )
      }

      // Use the shared singleton — avoids opening a competing connection.
      const settings = getDbSettings()
      const recentSessions = getRecentSessions(directory, 5)

      const sessionStats = recentSessions.map((s) => {
        const observations = getObservationsForSession(s.id!)
        const summary = getSessionSummary(s.id!)
        return {
          project: s.project,
          directory: s.directory,
          content_session_id: s.content_session_id,
          observations_in_session: observations.length,
          last_active: s.last_active_at,
          prompt_count: s.prompt_count,
          has_summary: !!summary,
          summary_length: summary?.content.length ?? 0,
          summary_preview: summary?.content.slice(0, 200) ?? null,
          handoff_metadata: summary?.metadata ?? null,
        }
      })

      return JSON.stringify(
        {
          database_exists: true,
          path: dbPath,
          status: "ACTIVE",
          pragma_settings: settings,
          recent_sessions_in_directory: sessionStats,
        },
        null,
        2
      )
    } catch (err) {
      return JSON.stringify(
        {
          status: "ERROR",
          error: String(err),
          path: dbPath,
        },
        null,
        2
      )
    }
  },
})
