import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// Allow test overrides via env var so tests don't pollute the real DB.
function resolveMemoryDir(): string {
  return process.env.FLOWDECK_MEMORY_DIR ?? join(homedir(), ".flowdeck-memory")
}

// How many times to retry a SQLITE_BUSY failure at the JS level (beyond what
// busy_timeout already handles at the C level).
const JS_RETRY_COUNT = 3
const JS_RETRY_BASE_MS = 50

let db: Database | null = null

// ── debug logging ───────────────────────────────────────────────────────────

function debugLog(msg: string): void {
  if (process.env.FLOWDECK_MEMORY_DEBUG) {
    console.error(`[FlowDeck Memory] ${msg}`)
  }
}

// ── database lifecycle ──────────────────────────────────────────────────────

function getDb(): Database {
  if (!db) {
    const dir = resolveMemoryDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, "memory.db")
    db = new Database(dbPath)
    debugLog(`DB opened: ${dbPath}`)
    initializeSchema(db)
  }
  return db
}

function initializeSchema(database: Database): void {
  // WAL mode: allows concurrent readers while a single writer holds the lock.
  // Critical for multi-process scenarios (each OpenCode session is a separate
  // OS process opening the same file).
  database.run("PRAGMA journal_mode = WAL")

  // busy_timeout: SQLite C-level retry for up to 5s before surfacing
  // SQLITE_BUSY to JavaScript. Covers the vast majority of cross-process
  // contention without any JS-level polling.
  database.run("PRAGMA busy_timeout = 5000")

  // NORMAL is safe with WAL and faster than FULL; WAL mode already provides
  // durability via the write-ahead log.
  database.run("PRAGMA synchronous = NORMAL")

  // Auto-checkpoint the WAL after 1000 frames to keep the WAL file bounded.
  database.run("PRAGMA wal_autocheckpoint = 1000")

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
      metadata TEXT,
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

  // Migrate existing databases that predate the metadata column.
  const summaryColumns = (database.prepare("PRAGMA table_info(summaries)").all() as Array<{ name: string }>).map(
    (c) => c.name
  )
  if (!summaryColumns.includes("metadata")) {
    database.run("ALTER TABLE summaries ADD COLUMN metadata TEXT")
    debugLog("Migrated summaries table: added metadata column")
  }
}

// ── write serialization ─────────────────────────────────────────────────────

function isBusyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string; message?: string }
  return e.code === "SQLITE_BUSY" || (e.message?.includes("database is locked") ?? false)
}

// Synchronous sleep suitable for Bun/Node.js main thread.
function sleepSync(ms: number): void {
  try {
    // Atomics.wait is the accurate synchronous wait in Bun/Node.js.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {
    // Fallback for environments that reject Atomics.wait on the main thread.
    const end = Date.now() + ms
    while (Date.now() < end) { /* spin */ }
  }
}

/**
 * Executes a synchronous write operation with JS-level retry on SQLITE_BUSY.
 *
 * busy_timeout (5000ms) already handles most contention at the SQLite C level.
 * This JS-level retry is a belt-and-suspenders for the rare cases where the
 * C-level timeout is exhausted (e.g., extremely heavy cross-process writes).
 */
function executeWrite<T>(fn: () => T, context: string): T {
  for (let attempt = 0; attempt <= JS_RETRY_COUNT; attempt++) {
    const start = Date.now()
    try {
      const result = fn()
      const duration = Date.now() - start
      if (attempt > 0) {
        debugLog(`${context}: succeeded after ${attempt} JS retr${attempt === 1 ? "y" : "ies"} (${duration}ms)`)
      } else {
        debugLog(`${context}: completed in ${duration}ms`)
      }
      return result
    } catch (err) {
      if (isBusyError(err) && attempt < JS_RETRY_COUNT) {
        const delay = JS_RETRY_BASE_MS * (attempt + 1)
        debugLog(`${context}: SQLITE_BUSY — JS retry ${attempt + 1}/${JS_RETRY_COUNT} after ${delay}ms`)
        sleepSync(delay)
        continue
      }
      throw err
    }
  }
  // Unreachable, but satisfies the TypeScript compiler.
  throw new Error(`${context}: exhausted all retries`)
}

/**
 * Structured handoff artifact persisted alongside the text summary.
 * Derived from observations + LLM compaction output.
 */
export interface HandoffMetadata {
  workflow_name: string | null
  current_status: string
  current_stage: string | null
  completed_stages: string[]
  pending_stages: string[]
  key_decisions: string[]
  blockers: string[]
  important_files: string[]
  approvals: string[]
  open_questions: string[]
  next_steps: string[]
  tool_names_used: string[]
  observation_count: number
  updated_at: string
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
  metadata?: HandoffMetadata | null
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
      "INSERT INTO sessions (content_session_id, project, directory, created_at, last_active_at, prompt_count) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(contentSessionId, project, directory, now, now, 1)

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
  const serializedInput = serializeToolInput(toolInput)
  const truncatedResponse = toolResponse ? toolResponse.slice(0, 10000) : null

  // Wrap both writes in a single transaction: shorter lock window and atomicity.
  const result = executeWrite(
    database.transaction(() => {
      const r = database
        .prepare(
          "INSERT INTO observations (session_id, tool_name, tool_input, tool_response, directory, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(sessionId, toolName, serializedInput, truncatedResponse, directory, now)
      database
        .prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?")
        .run(now, sessionId)
      return r
    }),
    `storeObservation(${toolName})`
  )

  return {
    id: result.lastInsertRowid as number,
    session_id: sessionId,
    tool_name: toolName,
    tool_input: parseToolInput(serializedInput),
    tool_response: truncatedResponse,
    directory,
    created_at: now,
  }
}

export function storeSummary(sessionId: number, content: string, metadata?: HandoffMetadata | null): Summary {
  const database = getDb()
  const now = new Date().toISOString()
  const serializedMetadata = metadata ? JSON.stringify(metadata) : null

  // Wrap both writes in a single transaction to minimise lock duration.
  const id = executeWrite(
    database.transaction(() => {
      database
        .prepare("INSERT OR REPLACE INTO summaries (session_id, content, metadata, created_at) VALUES (?, ?, ?, ?)")
        .run(sessionId, content, serializedMetadata, now)
      database
        .prepare("UPDATE sessions SET summary = ? WHERE id = ?")
        .run(content.slice(0, 2000), sessionId)
      return (database.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id
    }),
    `storeSummary(session=${sessionId})`
  )

  debugLog(
    `storeSummary: wrote ${content.length} chars${metadata ? ` + ${JSON.stringify(metadata).length}B metadata` : ""} for session ${sessionId}`
  )

  return {
    id,
    session_id: sessionId,
    content,
    metadata: metadata ?? null,
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
  const row = database.prepare("SELECT * FROM summaries WHERE session_id = ?").get(sessionId) as
    | (Summary & { metadata: string | null })
    | undefined
  if (!row) return null
  return {
    ...row,
    metadata: row.metadata ? (JSON.parse(row.metadata) as HandoffMetadata) : null,
  }
}

export function getSessionByContentSessionId(contentSessionId: string): Session | null {
  const database = getDb()
  return (
    (database.prepare("SELECT * FROM sessions WHERE content_session_id = ?").get(contentSessionId) as Session) || null
  )
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

  const summaryRows = getDb()
    .prepare(
      `SELECT su.* FROM summaries su
       JOIN sessions s ON su.session_id = s.id
       WHERE s.directory = ?
       ORDER BY su.created_at DESC
       LIMIT 3`
    )
    .all(directory) as (Summary & { metadata: string | null })[]

  const summaries: Summary[] = summaryRows.map((r) => ({
    ...r,
    metadata: r.metadata ? (JSON.parse(r.metadata) as HandoffMetadata) : null,
  }))

  if (summaries.length > 0) {
    lines.push("\n## Session Summaries")
    for (const sum of summaries) {
      const date = sum.created_at ? new Date(sum.created_at!).toLocaleDateString() : "unknown"
      lines.push(`\n### [${date}]`)
      lines.push(sum.content.slice(0, 2000))
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

/**
 * Returns current connection-level PRAGMA values.
 * Intended for diagnostics and tests — queries via the shared singleton so the
 * values reflect what this module actually set, not a second connection.
 */
export function getDbSettings(): { journal_mode: string; busy_timeout: number; synchronous: number; wal_autocheckpoint: number } {
  const database = getDb()
  const journalMode = (database.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode
  const busyTimeout = (database.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout
  const synchronous = (database.prepare("PRAGMA synchronous").get() as { synchronous: number }).synchronous
  const walAutocheckpoint = (database.prepare("PRAGMA wal_autocheckpoint").get() as { wal_autocheckpoint: number }).wal_autocheckpoint
  return { journal_mode: journalMode, busy_timeout: busyTimeout, synchronous, wal_autocheckpoint: walAutocheckpoint }
}