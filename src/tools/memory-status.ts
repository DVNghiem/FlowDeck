import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Database } from "bun:sqlite"
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const DB_PATH = join(homedir(), ".flowdeck-memory", "memory.db")

export const memoryStatusTool: ToolDefinition = tool({
  description: "Check FlowDeck memory database status, statistics, and recent sessions",
  args: {},
  async execute(_args, _context) {
    try {
      const exists = existsSync(DB_PATH)
      
      const result = {
        database_exists: exists,
        path: DB_PATH,
        status: exists ? "ACTIVE" : "NOT_INITIALIZED",
        statistics: null as any,
      }

      if (exists) {
        try {
          const db = new Database(DB_PATH)
          
          const sessions = db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number }
          const observations = db.prepare("SELECT COUNT(*) as count FROM observations").get() as { count: number }
          const summaries = db.prepare("SELECT COUNT(*) as count FROM summaries").get() as { count: number }

          const recentSessions = db.prepare(`
            SELECT 
              id,
              content_session_id,
              project,
              directory,
              created_at,
              last_active_at,
              prompt_count
            FROM sessions
            ORDER BY last_active_at DESC
            LIMIT 5
          `).all() as any[]

          result.statistics = {
            sessions: sessions.count,
            observations: observations.count,
            summaries: summaries.count,
            recent_sessions: recentSessions.map(s => {
              const obsCount = db.prepare("SELECT COUNT(*) as count FROM observations WHERE session_id = ?").get(s.id) as { count: number }
              return {
                project: s.project,
                directory: s.directory,
                observations_in_session: obsCount.count,
                last_active: s.last_active_at,
                prompt_count: s.prompt_count,
              }
            })
          }

          db.close()
        } catch (err) {
          result.status = "ERROR"
          result.statistics = { error: String(err) }
        }
      }

      return JSON.stringify(result, null, 2)
    } catch (err) {
      return JSON.stringify({
        status: "ERROR",
        error: String(err),
        path: DB_PATH,
      }, null, 2)
    }
  },
})
