import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const MEMORY_DIR = join(homedir(), ".flowdeck-memory")
const DB_PATH = join(MEMORY_DIR, "memory.db")

function ensureDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true })
  }
}

let db: Database | null = null

function getDb(): Database {
  if (!db) {
    ensureDir()
    db = new Database(DB_PATH)
    initializeSchema(db)
  }
  return db
}

function initializeSchema(database: Database): void {
  const schema = `
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_session_id TEXT NOT NULL UNIQUE,
      project TEXT NOT NULL,
      directory TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary TEXT,
      prompt_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      tool_input TEXT,
      tool_response TEXT,
      directory TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
    CREATE INDEX IF NOT EXISTS idx_observations_directory ON observations(directory);
    CREATE INDEX IF NOT EXISTS idx_observations_tool ON observations(tool_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
    CREATE INDEX IF NOT EXISTS idx_sessions_directory ON sessions(directory);
  `
  database.run(schema)
}

export interface Observation {
  id?: number
  session_id: number
  tool_name: string
  tool_input: Record<string, unknown> | null
  tool_response: string | null
  directory: string
  created_at?: string
}

export interface Session {
  id?: number
  content_session_id: string
  project: string
  directory: string
  created_at?: string
  last_active_at?: string
  summary?: string | null
  prompt_count?: number
}

export interface Summary {
  id?: number
  session_id: number
  content: string
  created_at?: string
}

export interface SearchResult {
  observation: Observation
  session: Session
}

function serializeToolInput(input: unknown): string | null {
  if (!input) return null
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

function parseToolInput(input: string | null): Record<string, unknown> | null {
  if (!input) return null
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export function initSession(contentSessionId: string, project: string, directory: string): Session {
  const database = getDb()
  const now = new Date().toISOString()

  const existing = database
    .prepare("SELECT * FROM sessions WHERE content_session_id = ?")
    .get(contentSessionId) as Session | undefined

  if (existing) {
    database
      .prepare("UPDATE sessions SET last_active_at = ?, prompt_count = prompt_count + 1 WHERE id = ?")
      .run(now, existing.id!)
    return { ...existing, last_active_at: now, prompt_count: (existing.prompt_count || 0) + 1 }
  }

  const result = database
    .prepare(
      "INSERT INTO sessions (content_session_id, project, directory, created_at, last_active_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(contentSessionId, project, directory, now, now)

  return {
    id: result.lastInsertRowid as number,
    content_session_id: contentSessionId,
    project,
    directory,
    created_at: now,
    last_active_at: now,
    prompt_count: 1,
  }
}

export function storeObservation(
  sessionId: number,
  toolName: string,
  toolInput: unknown,
  toolResponse: string | null,
  directory: string
): Observation {
  const database = getDb()
  const now = new Date().toISOString()

  const result = database
    .prepare(
      "INSERT INTO observations (session_id, tool_name, tool_input, tool_response, directory, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(sessionId, toolName, serializeToolInput(toolInput), toolResponse ? toolResponse.slice(0, 10000) : null, directory, now)

  database.prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?").run(now, sessionId)

  return {
    id: result.lastInsertRowid as number,
    session_id: sessionId,
    tool_name: toolName,
    tool_input: parseToolInput(serializeToolInput(toolInput)),
    tool_response: toolResponse ? toolResponse.slice(0, 10000) : null,
    directory,
    created_at: now,
  }
}

export function storeSummary(sessionId: number, content: string): Summary {
  const database = getDb()
  const now = new Date().toISOString()

  database
    .prepare("INSERT OR REPLACE INTO summaries (session_id, content, created_at) VALUES (?, ?, ?)")
    .run(sessionId, content, now)

  database.prepare("UPDATE sessions SET summary = ? WHERE id = ?").run(content, sessionId)

  return {
    id: (database.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id,
    session_id: sessionId,
    content,
    created_at: now,
  }
}

export function getRecentSessions(directory: string, limit = 5): Session[] {
  const database = getDb()
  return database
    .prepare(
      `SELECT * FROM sessions
       WHERE directory = ?
       ORDER BY last_active_at DESC
       LIMIT ?`
    )
    .all(directory, limit) as Session[]
}

export function getObservationsForSession(sessionId: number): Observation[] {
  const database = getDb()
  const observations = database
    .prepare("SELECT * FROM observations WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as Observation[]

  return observations.map((obs) => ({
    ...obs,
    tool_input: parseToolInput(obs.tool_input as string | null),
  }))
}

export function getSessionSummary(sessionId: number): Summary | null {
  const database = getDb()
  return (database.prepare("SELECT * FROM summaries WHERE session_id = ?").get(sessionId) as Summary) || null
}

export function getRecentObservations(directory: string, limit = 50): SearchResult[] {
  const database = getDb()
  const rows = database
    .prepare(
      `SELECT o.*, s.project, s.content_session_id, s.created_at as session_created
       FROM observations o
       JOIN sessions s ON o.session_id = s.id
       WHERE o.directory = ?
       ORDER BY o.created_at DESC
       LIMIT ?`
    )
    .all(directory, limit) as (Observation & { project: string; content_session_id: string; session_created: string })[]

  return rows.map((row) => ({
    observation: {
      ...row,
      tool_input: parseToolInput(row.tool_input as string | null),
    },
    session: {
      content_session_id: row.content_session_id,
      project: row.project,
      directory,
      created_at: row.session_created,
    },
  }))
}

export function searchObservations(directory: string, query: string, limit = 10): SearchResult[] {
  const database = getDb()
  const pattern = `%${query}%`

  const rows = database
    .prepare(
      `SELECT o.*, s.project, s.content_session_id, s.created_at as session_created
       FROM observations o
       JOIN sessions s ON o.session_id = s.id
       WHERE o.directory = ? AND (o.tool_name LIKE ? OR o.tool_input LIKE ? OR o.tool_response LIKE ?)
       ORDER BY o.created_at DESC
       LIMIT ?`
    )
    .all(directory, pattern, pattern, pattern, limit) as (Observation & { project: string; content_session_id: string; session_created: string })[]

  return rows.map((row) => ({
    observation: {
      ...row,
      tool_input: parseToolInput(row.tool_input as string | null),
    },
    session: {
      content_session_id: row.content_session_id,
      project: row.project,
      directory,
      created_at: row.session_created,
    },
  }))
}

export function getContextForDirectory(directory: string, maxObservations = 20): string {
  const recentObs = getRecentObservations(directory, maxObservations)

  if (recentObs.length === 0) return ""

  const lines: string[] = ["## Recent Context"]

  for (const { observation, session } of recentObs) {
    const date = observation.created_at ? new Date(observation.created_at!).toLocaleDateString() : "unknown"
    lines.push(`\n### [${date}] ${session.project} - ${observation.tool_name}`)
    if (observation.tool_input && Object.keys(observation.tool_input).length > 0) {
      const preview = JSON.stringify(observation.tool_input).slice(0, 200)
      lines.push(`Input: ${preview}${preview.length >= 200 ? "..." : ""}`)
    }
    if (observation.tool_response) {
      const preview = observation.tool_response.slice(0, 300)
      lines.push(`Output: ${preview}${observation.tool_response.length > 300 ? "..." : ""}`)
    }
  }

  const summaries = getDb()
    .prepare(
      `SELECT su.* FROM summaries su
       JOIN sessions s ON su.session_id = s.id
       WHERE s.directory = ?
       ORDER BY su.created_at DESC
       LIMIT 3`
    )
    .all(directory) as Summary[]

  if (summaries.length > 0) {
    lines.push("\n## Session Summaries")
    for (const sum of summaries) {
      const date = sum.created_at ? new Date(sum.created_at!).toLocaleDateString() : "unknown"
      lines.push(`\n### [${date}]`)
      lines.push(sum.content.slice(0, 500))
    }
  }

  return lines.join("\n")
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}