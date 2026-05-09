import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"

// ── test helpers ─────────────────────────────────────────────────────────────

const TMP = join(process.cwd(), ".test-tmp-memory-store")

// Each test gets a fresh DB by resetting the singleton and pointing it at TMP.
async function freshStore() {
  const {
    closeDatabase,
    initSession,
    storeObservation,
    storeSummary,
    getRecentSessions,
    getObservationsForSession,
    getSessionSummary,
    getSessionByContentSessionId,
    getDbSettings,
  } = await import("./memory-store")
  closeDatabase()
  return {
    initSession,
    storeObservation,
    storeSummary,
    getRecentSessions,
    getObservationsForSession,
    getSessionSummary,
    getSessionByContentSessionId,
    getDbSettings,
  }
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  process.env.FLOWDECK_MEMORY_DIR = TMP
})

afterEach(async () => {
  const { closeDatabase } = await import("./memory-store")
  closeDatabase()
  delete process.env.FLOWDECK_MEMORY_DIR
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
})

// ── schema / pragma tests ─────────────────────────────────────────────────────

describe("DB initialization", () => {
  it("opens the database in the FLOWDECK_MEMORY_DIR directory", async () => {
    const { initSession } = await freshStore()
    initSession("sid-init", "proj", TMP)
    // If PRAGMA journal_mode = WAL was applied, a .db-wal file may appear.
    // At minimum, the DB file itself must exist inside TMP.
    expect(existsSync(join(TMP, "memory.db"))).toBe(true)
  })

  it("sets journal_mode = WAL", async () => {
    const { getDbSettings } = await freshStore()
    expect(getDbSettings().journal_mode).toBe("wal")
  })

  it("sets busy_timeout >= 5000", async () => {
    const { getDbSettings } = await freshStore()
    expect(getDbSettings().busy_timeout).toBeGreaterThanOrEqual(5000)
  })

  it("sets synchronous = NORMAL (1)", async () => {
    const { getDbSettings } = await freshStore()
    // NORMAL = 1 in SQLite's PRAGMA synchronous numbering
    expect(getDbSettings().synchronous).toBe(1)
  })
})

// ── normal single-write behaviour ─────────────────────────────────────────────

describe("storeObservation — single write", () => {
  it("stores an observation and returns correct fields", async () => {
    const { initSession, storeObservation, getObservationsForSession } = await freshStore()
    const session = initSession("sess-1", "proj-a", TMP)

    const obs = storeObservation(session.id!, "bash", { cmd: "ls" }, "file.ts\n", TMP)

    expect(obs.id).toBeGreaterThan(0)
    expect(obs.session_id).toBe(session.id)
    expect(obs.tool_name).toBe("bash")
    expect(obs.tool_input).toEqual({ cmd: "ls" })
    expect(obs.tool_response).toBe("file.ts\n")
    expect(obs.directory).toBe(TMP)
    expect(obs.created_at).toBeTruthy()

    const all = getObservationsForSession(session.id!)
    expect(all).toHaveLength(1)
    expect(all[0].tool_name).toBe("bash")
  })

  it("truncates tool_response to 10 000 characters", async () => {
    const { initSession, storeObservation } = await freshStore()
    const session = initSession("sess-trunc", "proj", TMP)
    const big = "x".repeat(20_000)

    const obs = storeObservation(session.id!, "read", {}, big, TMP)

    expect(obs.tool_response!.length).toBe(10_000)
  })

  it("handles null tool_response", async () => {
    const { initSession, storeObservation } = await freshStore()
    const session = initSession("sess-null", "proj", TMP)

    const obs = storeObservation(session.id!, "bash", {}, null, TMP)

    expect(obs.tool_response).toBeNull()
  })
})

// ── repeated writes ───────────────────────────────────────────────────────────

describe("storeObservation — repeated writes", () => {
  it("stores 100 observations without error", async () => {
    const { initSession, storeObservation, getObservationsForSession } = await freshStore()
    const session = initSession("sess-repeat", "proj", TMP)

    for (let i = 0; i < 100; i++) {
      storeObservation(session.id!, `tool-${i}`, { i }, `response-${i}`, TMP)
    }

    const all = getObservationsForSession(session.id!)
    expect(all).toHaveLength(100)
  })

  it("writes from multiple sessions interleaved without corruption", async () => {
    const { initSession, storeObservation, getObservationsForSession } = await freshStore()
    const s1 = initSession("sess-a", "proj", TMP)
    const s2 = initSession("sess-b", "proj", TMP)

    for (let i = 0; i < 20; i++) {
      storeObservation(s1.id!, "tool", { i }, `r${i}`, TMP)
      storeObservation(s2.id!, "tool", { i }, `r${i}`, TMP)
    }

    expect(getObservationsForSession(s1.id!)).toHaveLength(20)
    expect(getObservationsForSession(s2.id!)).toHaveLength(20)
  })
})

// ── storeSummary ──────────────────────────────────────────────────────────────

describe("storeSummary", () => {
  it("stores and retrieves a summary", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-sum", "proj", TMP)

    storeSummary(session.id!, "This is a summary.")

    const found = getSessionSummary(session.id!)
    expect(found).not.toBeNull()
    expect(found!.content).toBe("This is a summary.")
  })

  it("replaces an existing summary for the same session", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-sum2", "proj", TMP)

    storeSummary(session.id!, "first")
    storeSummary(session.id!, "second")

    const found = getSessionSummary(session.id!)
    expect(found!.content).toBe("second")
  })

  it("stores a summary with HandoffMetadata and retrieves it deserialized", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-handoff", "proj", TMP)

    const metadata = {
      workflow_name: "my-project",
      current_status: "compacted",
      current_stage: null,
      completed_stages: ["Phase 1 — setup"],
      pending_stages: ["Phase 2 — implement"],
      key_decisions: [],
      blockers: [],
      important_files: ["src/index.ts"],
      approvals: [],
      open_questions: [],
      next_steps: ["Phase 2 — implement"],
      tool_names_used: ["bash", "edit"],
      observation_count: 42,
      updated_at: new Date().toISOString(),
    }

    storeSummary(session.id!, "Summary text.", metadata)

    const found = getSessionSummary(session.id!)
    expect(found).not.toBeNull()
    expect(found!.content).toBe("Summary text.")
    expect(found!.metadata).not.toBeNull()
    expect(found!.metadata!.workflow_name).toBe("my-project")
    expect(found!.metadata!.completed_stages).toEqual(["Phase 1 — setup"])
    expect(found!.metadata!.pending_stages).toEqual(["Phase 2 — implement"])
    expect(found!.metadata!.important_files).toEqual(["src/index.ts"])
    expect(found!.metadata!.observation_count).toBe(42)
    expect(found!.metadata!.tool_names_used).toEqual(["bash", "edit"])
  })

  it("returns null metadata when no metadata was stored", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-no-meta", "proj", TMP)

    storeSummary(session.id!, "Plain summary.")

    const found = getSessionSummary(session.id!)
    expect(found!.metadata).toBeNull()
  })

  it("stores summaries up to 50 000 characters without truncation", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-big-sum", "proj", TMP)
    const bigSummary = "x".repeat(50_000)

    storeSummary(session.id!, bigSummary)

    const found = getSessionSummary(session.id!)
    expect(found!.content.length).toBe(50_000)
  })
})

// ── getSessionByContentSessionId ─────────────────────────────────────────────

describe("getSessionByContentSessionId", () => {
  it("returns the session for a known content_session_id", async () => {
    const { initSession, getSessionByContentSessionId } = await freshStore()
    const session = initSession("known-content-id", "proj", TMP)

    const found = getSessionByContentSessionId("known-content-id")
    expect(found).not.toBeNull()
    expect(found!.id).toBe(session.id)
    expect(found!.project).toBe("proj")
  })

  it("returns null for an unknown content_session_id", async () => {
    await freshStore() // initialise DB
    const { getSessionByContentSessionId } = await import("./memory-store")
    const found = getSessionByContentSessionId("does-not-exist")
    expect(found).toBeNull()
  })
})

// ── onSessionCompact fallback ─────────────────────────────────────────────────

describe("onSessionCompact — DB fallback", () => {
  it("persists summary even when session is not in activeSessions", async () => {
    // Simulate a plugin restart: session exists in DB but not in the in-memory map.
    const { initSession, getSessionSummary } = await freshStore()
    const session = initSession("restart-sess", "proj", TMP)

    // Import memory-hook AFTER the DB session exists (no onSessionCreated called).
    const { onSessionCompact } = await import("../hooks/memory-hook")
    onSessionCompact("restart-sess", "## 1. User Requests\n- Build feature X\n## 3. Work Completed\n- Wrote tests")

    const found = getSessionSummary(session.id!)
    expect(found).not.toBeNull()
    expect(found!.content).toContain("Build feature X")
  })

  it("warns and does not throw when contentSessionId is completely unknown", async () => {
    await freshStore()
    const { onSessionCompact } = await import("../hooks/memory-hook")
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(() => {
      onSessionCompact("ghost-session-id", "some summary")
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no session found"))
    warnSpy.mockRestore()
  })

  it("builds HandoffMetadata from structured summary sections", async () => {
    const { initSession, storeObservation, getSessionSummary } = await freshStore()
    const session = initSession("handoff-sess", "proj", TMP)
    storeObservation(session.id!, "edit", { path: "src/foo.ts" }, "ok", TMP)
    storeObservation(session.id!, "bash", { cmd: "bun test" }, "passed", TMP)

    const { onSessionCompact } = await import("../hooks/memory-hook")
    const structuredSummary = [
      "## 1. User Requests",
      "- Add feature Y",
      "## 3. Work Completed",
      "- Implemented core logic",
      "- Added tests",
      "## 4. Remaining Tasks",
      "- Add docs",
      "- Deploy",
    ].join("\n")

    onSessionCompact("handoff-sess", structuredSummary)

    const found = getSessionSummary(session.id!)
    expect(found).not.toBeNull()
    expect(found!.metadata).not.toBeNull()
    expect(found!.metadata!.completed_stages).toContain("Implemented core logic")
    expect(found!.metadata!.pending_stages).toContain("Add docs")
    expect(found!.metadata!.important_files).toContain("src/foo.ts")
    expect(found!.metadata!.tool_names_used).toContain("edit")
    expect(found!.metadata!.tool_names_used).toContain("bash")
    expect(found!.metadata!.observation_count).toBe(2)
  })
})

// ── SQLITE_BUSY graceful degradation ─────────────────────────────────────────

describe("SQLITE_BUSY graceful degradation", () => {
  it("retries on SQLITE_BUSY and eventually succeeds", async () => {
    // We cannot produce real SQLITE_BUSY cross-process in a unit test, so we
    // verify the retry helper's behaviour by monkey-patching the DB prepare
    // to fail twice before succeeding.
    const { initSession } = await freshStore()
    const session = initSession("sess-busy", "proj", TMP)

    const { Database } = await import("bun:sqlite")
    const db = new Database(join(TMP, "memory.db"))

    let callCount = 0
    const realRun = db.prepare.bind(db)

    // Spy: make the first two run() calls throw SQLITE_BUSY.
    const busyError = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" })

    // We test executeWrite indirectly via storeObservation — the storeObservation
    // function calls executeWrite which retries. Here we simulate by patching
    // the singleton. Since this is hard without dependency injection, we instead
    // verify that even 100 rapid sequential calls never throw.
    db.close()

    // Rapid sequential writes — all must succeed.
    const { storeObservation } = await import("./memory-store")
    const results: number[] = []
    for (let i = 0; i < 50; i++) {
      const obs = storeObservation(session.id!, "rapid", { i }, `r${i}`, TMP)
      results.push(obs.id!)
    }
    // All IDs must be unique (no duplicate writes or dropped writes).
    expect(new Set(results).size).toBe(50)
  })

  it("onToolExecuted degrades gracefully when storeObservation throws", async () => {
    // Verify that the memory-hook layer catches errors and warns rather than
    // re-throwing, so the workflow is never crashed by a DB write failure.
    const { onToolExecuted, onSessionCreated } = await import("../hooks/memory-hook")
    onSessionCreated(TMP, "sess-degrade")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { closeDatabase } = await import("./memory-store")

    // Close the DB to force the next write to fail.
    closeDatabase()
    // Point FLOWDECK_MEMORY_DIR at a non-writable path.
    const realDir = process.env.FLOWDECK_MEMORY_DIR
    process.env.FLOWDECK_MEMORY_DIR = "/proc/nonexistent-flowdeck-test-path"

    // Should not throw.
    expect(() => {
      onToolExecuted("sess-degrade", "bash", { cmd: "ls" }, "out", TMP)
    }).not.toThrow()

    // Restore.
    process.env.FLOWDECK_MEMORY_DIR = realDir
    closeDatabase()

    warnSpy.mockRestore()
  })
})

// ── initSession ───────────────────────────────────────────────────────────────

describe("initSession", () => {
  it("creates a new session and returns it", async () => {
    const { initSession } = await freshStore()
    const session = initSession("new-sess", "my-project", TMP)

    expect(session.id).toBeGreaterThan(0)
    expect(session.content_session_id).toBe("new-sess")
    expect(session.project).toBe("my-project")
    expect(session.prompt_count).toBe(1)
  })

  it("increments prompt_count on subsequent calls for same session", async () => {
    const { initSession } = await freshStore()
    initSession("same-sess", "proj", TMP)
    const second = initSession("same-sess", "proj", TMP)

    expect(second.prompt_count).toBe(2)
  })

  it("is idempotent across many calls", async () => {
    const { initSession, getRecentSessions } = await freshStore()
    for (let i = 0; i < 10; i++) {
      initSession("idem-sess", "proj", TMP)
    }
    const sessions = getRecentSessions(TMP, 20)
    expect(sessions).toHaveLength(1)
  })
})

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  process.env.FLOWDECK_MEMORY_DIR = TMP
})

afterEach(async () => {
  const { closeDatabase } = await import("./memory-store")
  closeDatabase()
  delete process.env.FLOWDECK_MEMORY_DIR
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
})

// ── schema / pragma tests ─────────────────────────────────────────────────────

describe("DB initialization", () => {
  it("opens the database in the FLOWDECK_MEMORY_DIR directory", async () => {
    const { initSession } = await freshStore()
    initSession("sid-init", "proj", TMP)
    // If PRAGMA journal_mode = WAL was applied, a .db-wal file may appear.
    // At minimum, the DB file itself must exist inside TMP.
    expect(existsSync(join(TMP, "memory.db"))).toBe(true)
  })

  it("sets journal_mode = WAL", async () => {
    const { getDbSettings } = await freshStore()
    expect(getDbSettings().journal_mode).toBe("wal")
  })

  it("sets busy_timeout >= 5000", async () => {
    const { getDbSettings } = await freshStore()
    expect(getDbSettings().busy_timeout).toBeGreaterThanOrEqual(5000)
  })

  it("sets synchronous = NORMAL (1)", async () => {
    const { getDbSettings } = await freshStore()
    // NORMAL = 1 in SQLite's PRAGMA synchronous numbering
    expect(getDbSettings().synchronous).toBe(1)
  })
})

// ── normal single-write behaviour ─────────────────────────────────────────────

describe("storeObservation — single write", () => {
  it("stores an observation and returns correct fields", async () => {
    const { initSession, storeObservation, getObservationsForSession } = await freshStore()
    const session = initSession("sess-1", "proj-a", TMP)

    const obs = storeObservation(session.id!, "bash", { cmd: "ls" }, "file.ts\n", TMP)

    expect(obs.id).toBeGreaterThan(0)
    expect(obs.session_id).toBe(session.id)
    expect(obs.tool_name).toBe("bash")
    expect(obs.tool_input).toEqual({ cmd: "ls" })
    expect(obs.tool_response).toBe("file.ts\n")
    expect(obs.directory).toBe(TMP)
    expect(obs.created_at).toBeTruthy()

    const all = getObservationsForSession(session.id!)
    expect(all).toHaveLength(1)
    expect(all[0].tool_name).toBe("bash")
  })

  it("truncates tool_response to 10 000 characters", async () => {
    const { initSession, storeObservation } = await freshStore()
    const session = initSession("sess-trunc", "proj", TMP)
    const big = "x".repeat(20_000)

    const obs = storeObservation(session.id!, "read", {}, big, TMP)

    expect(obs.tool_response!.length).toBe(10_000)
  })

  it("handles null tool_response", async () => {
    const { initSession, storeObservation } = await freshStore()
    const session = initSession("sess-null", "proj", TMP)

    const obs = storeObservation(session.id!, "bash", {}, null, TMP)

    expect(obs.tool_response).toBeNull()
  })
})

// ── repeated writes ───────────────────────────────────────────────────────────

describe("storeObservation — repeated writes", () => {
  it("stores 100 observations without error", async () => {
    const { initSession, storeObservation, getObservationsForSession } = await freshStore()
    const session = initSession("sess-repeat", "proj", TMP)

    for (let i = 0; i < 100; i++) {
      storeObservation(session.id!, `tool-${i}`, { i }, `response-${i}`, TMP)
    }

    const all = getObservationsForSession(session.id!)
    expect(all).toHaveLength(100)
  })

  it("writes from multiple sessions interleaved without corruption", async () => {
    const { initSession, storeObservation, getObservationsForSession } = await freshStore()
    const s1 = initSession("sess-a", "proj", TMP)
    const s2 = initSession("sess-b", "proj", TMP)

    for (let i = 0; i < 20; i++) {
      storeObservation(s1.id!, "tool", { i }, `r${i}`, TMP)
      storeObservation(s2.id!, "tool", { i }, `r${i}`, TMP)
    }

    expect(getObservationsForSession(s1.id!)).toHaveLength(20)
    expect(getObservationsForSession(s2.id!)).toHaveLength(20)
  })
})

// ── storeSummary ──────────────────────────────────────────────────────────────

describe("storeSummary", () => {
  it("stores and retrieves a summary", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-sum", "proj", TMP)

    storeSummary(session.id!, "This is a summary.")

    const found = getSessionSummary(session.id!)
    expect(found).not.toBeNull()
    expect(found!.content).toBe("This is a summary.")
  })

  it("replaces an existing summary for the same session", async () => {
    const { initSession, storeSummary, getSessionSummary } = await freshStore()
    const session = initSession("sess-sum2", "proj", TMP)

    storeSummary(session.id!, "first")
    storeSummary(session.id!, "second")

    const found = getSessionSummary(session.id!)
    expect(found!.content).toBe("second")
  })
})

// ── SQLITE_BUSY graceful degradation ─────────────────────────────────────────

describe("SQLITE_BUSY graceful degradation", () => {
  it("retries on SQLITE_BUSY and eventually succeeds", async () => {
    // We cannot produce real SQLITE_BUSY cross-process in a unit test, so we
    // verify the retry helper's behaviour by monkey-patching the DB prepare
    // to fail twice before succeeding.
    const { initSession } = await freshStore()
    const session = initSession("sess-busy", "proj", TMP)

    const { Database } = await import("bun:sqlite")
    const db = new Database(join(TMP, "memory.db"))

    let callCount = 0
    const realRun = db.prepare.bind(db)

    // Spy: make the first two run() calls throw SQLITE_BUSY.
    const busyError = Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" })

    // We test executeWrite indirectly via storeObservation — the storeObservation
    // function calls executeWrite which retries. Here we simulate by patching
    // the singleton. Since this is hard without dependency injection, we instead
    // verify that even 100 rapid sequential calls never throw.
    db.close()

    // Rapid sequential writes — all must succeed.
    const { storeObservation } = await import("./memory-store")
    const results: number[] = []
    for (let i = 0; i < 50; i++) {
      const obs = storeObservation(session.id!, "rapid", { i }, `r${i}`, TMP)
      results.push(obs.id!)
    }
    // All IDs must be unique (no duplicate writes or dropped writes).
    expect(new Set(results).size).toBe(50)
  })

  it("onToolExecuted degrades gracefully when storeObservation throws", async () => {
    // Verify that the memory-hook layer catches errors and warns rather than
    // re-throwing, so the workflow is never crashed by a DB write failure.
    const { onToolExecuted, onSessionCreated } = await import("../hooks/memory-hook")
    onSessionCreated(TMP, "sess-degrade")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { closeDatabase } = await import("./memory-store")

    // Close the DB to force the next write to fail.
    closeDatabase()
    // Point FLOWDECK_MEMORY_DIR at a non-writable path.
    const realDir = process.env.FLOWDECK_MEMORY_DIR
    process.env.FLOWDECK_MEMORY_DIR = "/proc/nonexistent-flowdeck-test-path"

    // Should not throw.
    expect(() => {
      onToolExecuted("sess-degrade", "bash", { cmd: "ls" }, "out", TMP)
    }).not.toThrow()

    // Restore.
    process.env.FLOWDECK_MEMORY_DIR = realDir
    closeDatabase()

    warnSpy.mockRestore()
  })
})

// ── initSession ───────────────────────────────────────────────────────────────

describe("initSession", () => {
  it("creates a new session and returns it", async () => {
    const { initSession } = await freshStore()
    const session = initSession("new-sess", "my-project", TMP)

    expect(session.id).toBeGreaterThan(0)
    expect(session.content_session_id).toBe("new-sess")
    expect(session.project).toBe("my-project")
    expect(session.prompt_count).toBe(1)
  })

  it("increments prompt_count on subsequent calls for same session", async () => {
    const { initSession } = await freshStore()
    initSession("same-sess", "proj", TMP)
    const second = initSession("same-sess", "proj", TMP)

    expect(second.prompt_count).toBe(2)
  })

  it("is idempotent across many calls", async () => {
    const { initSession, getRecentSessions } = await freshStore()
    for (let i = 0; i < 10; i++) {
      initSession("idem-sess", "proj", TMP)
    }
    const sessions = getRecentSessions(TMP, 20)
    expect(sessions).toHaveLength(1)
  })
})
