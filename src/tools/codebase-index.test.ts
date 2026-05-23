import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"

const TEST_DIR = join(__dirname, ".test-codebase-index")

describe("CodebaseIndex", () => {
  let sut: typeof import("./codebase-index")

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    sut = await import("./codebase-index")
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  it("returns exists: false when index does not exist", () => {
    const result = sut.readCodebaseIndex(TEST_DIR)
    expect(result.exists).toBe(false)
  })

  it("returns fresh: true immediately after write", () => {
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: ["src/foo.ts"],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 1,
      freshnessStatus: "fresh",
    })
    const result = sut.readCodebaseIndex(TEST_DIR)
    expect(result.freshnessStatus).toBe("fresh")
  })

  it("marks stale when maxAgeMs exceeded", async () => {
    const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: pastTime,
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: [],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 1,
      freshnessStatus: "fresh",
    })
    const result = sut.isCodebaseIndexFresh(TEST_DIR, 5 * 60 * 1000)
    expect(result).toBe(false)
  })

  it("appends changed files without duplicates", () => {
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: ["src/a.ts"],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 1,
      freshnessStatus: "fresh",
    })
    sut.appendChangedFiles(TEST_DIR, "test-agent", "test-stage", ["src/b.ts", "src/c.ts"])
    const result = sut.readCodebaseIndex(TEST_DIR)
    expect(result.changedFiles).toContain("src/a.ts")
    expect(result.changedFiles).toContain("src/b.ts")
    expect(result.changedFiles).toContain("src/c.ts")
    sut.appendChangedFiles(TEST_DIR, "test-agent", "test-stage", ["src/a.ts"])
    const result2 = sut.readCodebaseIndex(TEST_DIR)
    expect(result2.changedFiles.filter(f => f === "src/a.ts").length).toBe(1)
  })

  it("records exploration history with reason", () => {
    sut.recordExploration(TEST_DIR, "code-explorer", ["src/foo.ts"], "state stale")
    const result = sut.readCodebaseIndex(TEST_DIR)
    expect(result.explorationHistory.length).toBe(1)
    expect(result.explorationHistory[0].reason).toBe("state stale")
    expect(result.explorationHistory[0].filesExplored).toEqual(["src/foo.ts"])
  })

  it("returns file snapshot for a known path", () => {
    const now = new Date().toISOString()
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: now,
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: [],
      fileSnapshots: {
        "src/foo.ts": {
          lastModifiedAt: now,
          lastModifiedBy: "backend-coder",
          changeType: "modified",
          sourceStage: "execute",
        },
      },
      explorationHistory: [],
      summaryVersion: 1,
      freshnessStatus: "fresh",
    })
    const snapshot = sut.getFileSnapshot(TEST_DIR, "src/foo.ts")
    expect(snapshot).not.toBeNull()
    expect(snapshot!.lastModifiedBy).toBe("backend-coder")
  })

  it("returns null snapshot for unknown path", () => {
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: [],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 1,
      freshnessStatus: "fresh",
    })
    const snapshot = sut.getFileSnapshot(TEST_DIR, "src/unknown.ts")
    expect(snapshot).toBeNull()
  })

  it("increments summaryVersion on each append", () => {
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: [],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 0,
      freshnessStatus: "fresh",
    })
    sut.appendChangedFiles(TEST_DIR, "test", "test", ["src/a.ts"])
    const v1 = sut.readCodebaseIndex(TEST_DIR).summaryVersion
    sut.appendChangedFiles(TEST_DIR, "test", "test", ["src/b.ts"])
    const v2 = sut.readCodebaseIndex(TEST_DIR).summaryVersion
    expect(v2).toBeGreaterThan(v1)
  })

  it("full lifecycle: write -> is fresh -> wait -> is stale", async () => {
    const now = new Date().toISOString()
    sut.writeCodebaseIndex(TEST_DIR, {
      lastUpdatedAt: now,
      lastUpdatedBy: "test",
      sourceStage: "test",
      changedFiles: ["src/a.ts"],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 1,
      freshnessStatus: "fresh",
    })

    // Immediately: fresh
    expect(sut.isCodebaseIndexFresh(TEST_DIR, 5 * 60 * 1000)).toBe(true)

    // Simulate staleness by writing old timestamp
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const current = sut.readCodebaseIndex(TEST_DIR)
    sut.writeCodebaseIndex(TEST_DIR, {
      ...current,
      lastUpdatedAt: oldTime,
      freshnessStatus: "fresh", // override to say fresh but it's old
    })

    // After 10 min with 5 min threshold: stale
    expect(sut.isCodebaseIndexFresh(TEST_DIR, 5 * 60 * 1000)).toBe(false)
  })
})