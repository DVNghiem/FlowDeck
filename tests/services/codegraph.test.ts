import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import * as childProcess from "child_process"
import type { SpawnSyncReturns } from "child_process"
import {
  isCodegraphInstalled,
  isCodegraphIndexed,
  readCodegraphMeta,
  writeCodegraphMeta,
  isCodegraphFresh,
  markCodegraphStale,
  hasChangedSinceLastIndex,
  installCodegraph,
  initCodegraphIndex,
} from "@/services/codegraph"

function spawn(status: number, stdout = "", stderr = ""): SpawnSyncReturns<string> {
  return { status, stdout, stderr, pid: 0, output: [null, stdout, stderr], signal: null }
}

const TEST_DIR = join(__dirname, ".test-codegraph")

function ensureTestCodebaseDir() {
  const base = join(TEST_DIR, ".codebase")
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
}

describe("codegraph service", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spawnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    spawnSpy = vi.spyOn(childProcess, "spawnSync")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  // ── isCodegraphInstalled ──────────────────────────────────────────────────

  describe("isCodegraphInstalled", () => {
    it("returns true when codegraph --version exits 0", () => {
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      expect(isCodegraphInstalled()).toBe(true)
    })

    it("returns false when codegraph --version exits non-zero", () => {
      spawnSpy.mockReturnValueOnce(spawn(1, "", "not found"))
      expect(isCodegraphInstalled()).toBe(false)
    })

    it("returns false when spawnSync throws", () => {
      spawnSpy.mockImplementationOnce(() => { throw new Error("ENOENT") })
      expect(isCodegraphInstalled()).toBe(false)
    })
  })

  // ── isCodegraphIndexed ────────────────────────────────────────────────────

  describe("isCodegraphIndexed", () => {
    it("returns false when .codegraph/ does not exist", () => {
      expect(isCodegraphIndexed(TEST_DIR)).toBe(false)
    })

    it("returns true when .codegraph/codegraph.db exists", () => {
      const dir = join(TEST_DIR, ".codegraph")
      mkdirSync(dir, { recursive: true })
      // create the DB file that codegraph index produces
      require("fs").writeFileSync(join(dir, "codegraph.db"), "")
      expect(isCodegraphIndexed(TEST_DIR)).toBe(true)
    })
  })

  // ── readCodegraphMeta / writeCodegraphMeta ────────────────────────────────

  describe("readCodegraphMeta", () => {
    it("returns defaults when CODEGRAPH.md does not exist", () => {
      const meta = readCodegraphMeta(TEST_DIR)
      expect(meta.installed).toBe(false)
      expect(meta.indexed).toBe(false)
      expect(meta.freshnessStatus).toBe("unknown")
    })

    it("round-trips meta through write then read", () => {
      ensureTestCodebaseDir()
      const now = new Date().toISOString()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: now,
        lastIndexedRevision: "abc1234",
        lastIndexedBy: "test-agent",
        freshnessStatus: "fresh",
        installLog: "install ok",
        indexLog: "index ok",
      })
      const meta = readCodegraphMeta(TEST_DIR)
      expect(meta.installed).toBe(true)
      expect(meta.indexed).toBe(true)
      expect(meta.lastIndexedRevision).toBe("abc1234")
      expect(meta.lastIndexedBy).toBe("test-agent")
      expect(meta.freshnessStatus).toBe("fresh")
    })
  })

  // ── isCodegraphFresh ──────────────────────────────────────────────────────

  describe("isCodegraphFresh", () => {
    it("returns false when meta does not exist", () => {
      expect(isCodegraphFresh(TEST_DIR)).toBe(false)
    })

    it("returns true immediately after write with fresh status", () => {
      ensureTestCodebaseDir()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "abc1234",
        lastIndexedBy: "test",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })
      expect(isCodegraphFresh(TEST_DIR, 5 * 60 * 1000)).toBe(true)
    })

    it("returns false when status is stale regardless of age", () => {
      ensureTestCodebaseDir()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "abc",
        lastIndexedBy: "test",
        freshnessStatus: "stale",
        installLog: "",
        indexLog: "",
      })
      expect(isCodegraphFresh(TEST_DIR, 60 * 60 * 1000)).toBe(false)
    })

    it("returns false when index is older than maxAgeMs", () => {
      ensureTestCodebaseDir()
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: oldTime,
        lastIndexedRevision: "abc",
        lastIndexedBy: "test",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })
      expect(isCodegraphFresh(TEST_DIR, 5 * 60 * 1000)).toBe(false)
    })
  })

  // ── markCodegraphStale ────────────────────────────────────────────────────

  describe("markCodegraphStale", () => {
    it("sets freshnessStatus to stale", () => {
      ensureTestCodebaseDir()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "abc",
        lastIndexedBy: "test",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })
      markCodegraphStale(TEST_DIR)
      const meta = readCodegraphMeta(TEST_DIR)
      expect(meta.freshnessStatus).toBe("stale")
    })
  })

  // ── installCodegraph ──────────────────────────────────────────────────────

  describe("installCodegraph", () => {
    it("skips install and returns alreadyInstalled=true when codegraph is found", () => {
      // First call: isCodegraphInstalled check
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      const result = installCodegraph()
      expect(result.success).toBe(true)
      expect(result.alreadyInstalled).toBe(true)
      // npm install should NOT have been called
      expect(spawnSpy).toHaveBeenCalledTimes(1)
    })

    it("runs npm install when codegraph is not installed and reports success", () => {
      // isCodegraphInstalled returns false
      spawnSpy.mockReturnValueOnce(spawn(1, "", ""))
      // npm install succeeds
      spawnSpy.mockReturnValueOnce(spawn(0, "added 1 package", ""))
      const result = installCodegraph()
      expect(result.success).toBe(true)
      expect(result.alreadyInstalled).toBe(false)
      expect(result.log).toContain("Install succeeded")
    })

    it("reports failure when npm install fails", () => {
      spawnSpy.mockReturnValueOnce(spawn(1, "", ""))
      spawnSpy.mockReturnValueOnce(spawn(1, "", "permission denied"))
      const result = installCodegraph()
      expect(result.success).toBe(false)
      expect(result.error).toContain("permission denied")
    })

    it("handles spawnSync exception during install gracefully", () => {
      spawnSpy.mockReturnValueOnce(spawn(1, "", ""))
      spawnSpy.mockImplementationOnce(() => { throw new Error("SPAWN_FAIL") })
      const result = installCodegraph()
      expect(result.success).toBe(false)
      expect(result.error).toContain("SPAWN_FAIL")
    })
  })

  // ── initCodegraphIndex ────────────────────────────────────────────────────

  describe("initCodegraphIndex", () => {
    it("writes fresh meta with revision on successful init", () => {
      ensureTestCodebaseDir()
      // isCodegraphInstalled: true
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      // git rev-parse HEAD
      spawnSpy.mockReturnValueOnce(spawn(0, "deadbeef\n", ""))
      // codegraph init --index (no .codegraph/codegraph.db yet)
      spawnSpy.mockReturnValueOnce(spawn(0, "Indexed 42 files", ""))

      const result = initCodegraphIndex(TEST_DIR, "test-agent")
      expect(result.success).toBe(true)
      expect(result.full).toBe(true)
      const meta = readCodegraphMeta(TEST_DIR)
      expect(meta.indexed).toBe(true)
      expect(meta.freshnessStatus).toBe("fresh")
      expect(meta.lastIndexedBy).toBe("test-agent")
    })

    it("writes stale meta when codegraph index fails", () => {
      ensureTestCodebaseDir()
      // isCodegraphInstalled: true
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      // git rev-parse
      spawnSpy.mockReturnValueOnce(spawn(0, "deadbeef\n", ""))
      // codegraph init --index: fails (no .codegraph/codegraph.db → no git diff call)
      spawnSpy.mockReturnValueOnce(spawn(1, "", "index error"))

      const result = initCodegraphIndex(TEST_DIR, "test-agent")
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      const meta = readCodegraphMeta(TEST_DIR)
      expect(meta.indexed).toBe(false)
      expect(meta.freshnessStatus).toBe("stale")
    })

    it("aborts with error when install fails", () => {
      ensureTestCodebaseDir()
      // isCodegraphInstalled: false (install check)
      spawnSpy.mockReturnValueOnce(spawn(1, "", ""))
      // npm install: fails
      spawnSpy.mockReturnValueOnce(spawn(1, "", "npm ERR!"))

      const result = initCodegraphIndex(TEST_DIR, "test-agent")
      expect(result.success).toBe(false)
      expect(result.error).toContain("install failed")
    })

    it("runs 'codegraph init --index' when .codegraph/codegraph.db does not exist", () => {
      ensureTestCodebaseDir()
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      spawnSpy.mockReturnValueOnce(spawn(0, "abc\n", ""))
      spawnSpy.mockReturnValueOnce(spawn(0, "done", ""))

      initCodegraphIndex(TEST_DIR, "test-agent")
      // Third call should be codegraph init --index
      const thirdCall = spawnSpy.mock.calls[2]
      expect(thirdCall[0]).toBe("codegraph")
      expect(thirdCall[1]).toEqual(["init", "--index"])
    })

    it("runs 'codegraph index --force' when .codegraph/codegraph.db already exists", () => {
      ensureTestCodebaseDir()
      const cgDir = join(TEST_DIR, ".codegraph")
      mkdirSync(cgDir, { recursive: true })
      require("fs").writeFileSync(join(cgDir, "codegraph.db"), "")

      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "oldrev",
        lastIndexedBy: "prior",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })

      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      spawnSpy.mockReturnValueOnce(spawn(0, "newrev\n", ""))
      // git diff (changed files since oldrev)
      spawnSpy.mockReturnValueOnce(spawn(0, "src/foo.ts\nsrc/bar.ts\n", ""))
      spawnSpy.mockReturnValueOnce(spawn(0, "done", ""))

      initCodegraphIndex(TEST_DIR, "test-agent")
      const fourthCall = spawnSpy.mock.calls[3]
      expect(fourthCall[0]).toBe("codegraph")
      expect(fourthCall[1]).toEqual(["index", "--force"])
    })
  })

  // ── refreshCodegraphIndex ─────────────────────────────────────────────────

  describe("refreshCodegraphIndex", () => {
    it("runs 'codegraph sync' when index exists", () => {
      ensureTestCodebaseDir()
      const cgDir = join(TEST_DIR, ".codegraph")
      mkdirSync(cgDir, { recursive: true })
      require("fs").writeFileSync(join(cgDir, "codegraph.db"), "")

      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "oldrev",
        lastIndexedBy: "prior",
        freshnessStatus: "stale",
        installLog: "",
        indexLog: "",
      })

      // isCodegraphInstalled: true
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      // git rev-parse
      spawnSpy.mockReturnValueOnce(spawn(0, "newrev\n", ""))
      // git diff (changed files)
      spawnSpy.mockReturnValueOnce(spawn(0, "src/x.ts\n", ""))
      // codegraph sync: succeeds
      spawnSpy.mockReturnValueOnce(spawn(0, "synced", ""))

      const result = require("@/services/codegraph").refreshCodegraphIndex(TEST_DIR, "test-agent")
      expect(result.success).toBe(true)
      expect(result.full).toBe(false)
      const syncCall = spawnSpy.mock.calls[3]
      expect(syncCall[1]).toEqual(["sync"])
    })

    it("falls back to full index when index does not exist", () => {
      ensureTestCodebaseDir()
      // isCodegraphInstalled: true
      spawnSpy.mockReturnValueOnce(spawn(0, "v1.0.0", ""))
      // git rev-parse (for initCodegraphIndex)
      spawnSpy.mockReturnValueOnce(spawn(0, "abc\n", ""))
      // codegraph init --index
      spawnSpy.mockReturnValueOnce(spawn(0, "done", ""))

      const result = require("@/services/codegraph").refreshCodegraphIndex(TEST_DIR, "test-agent")
      expect(result.full).toBe(true)
    })
  })

  // ── hasChangedSinceLastIndex ──────────────────────────────────────────────

  describe("hasChangedSinceLastIndex", () => {
    it("returns true when no meta exists", () => {
      expect(hasChangedSinceLastIndex(TEST_DIR)).toBe(true)
    })

    it("returns true when meta has no revision", () => {
      ensureTestCodebaseDir()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "",
        lastIndexedBy: "test",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })
      expect(hasChangedSinceLastIndex(TEST_DIR)).toBe(true)
    })

    it("returns false when no files changed since last index", () => {
      ensureTestCodebaseDir()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "abc123",
        lastIndexedBy: "test",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })
      // git diff: no changes
      spawnSpy.mockReturnValueOnce(spawn(0, "", ""))
      expect(hasChangedSinceLastIndex(TEST_DIR)).toBe(false)
    })

    it("returns true when files changed since last index", () => {
      ensureTestCodebaseDir()
      writeCodegraphMeta(TEST_DIR, {
        installed: true,
        indexed: true,
        lastIndexedAt: new Date().toISOString(),
        lastIndexedRevision: "abc123",
        lastIndexedBy: "test",
        freshnessStatus: "fresh",
        installLog: "",
        indexLog: "",
      })
      spawnSpy.mockReturnValueOnce(spawn(0, "src/changed.ts\n", ""))
      expect(hasChangedSinceLastIndex(TEST_DIR)).toBe(true)
    })
  })
})
