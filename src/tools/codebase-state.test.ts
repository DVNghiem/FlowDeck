import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, symlinkSync } from "fs"
import { join } from "path"
import { homedir, tmpdir } from "os"
import { codebaseDir, migrateIfNeeded, _resetMigrationForTests } from "./codebase-state"

// Use a tmp CWD that is NOT under ~/.fd-plan/ so that the "old" location
// (./codebase in CWD) and the "new" location (~/.fd-plan/<slug>/.codebase)
// are different paths. The test creates the old .codebase/ inside TMP_CWD
// and verifies migration moves it to ~/.fd-plan/<slug>/.codebase/.
//
// We also keep the test data on the same filesystem as ~/.fd-plan/ to avoid
// cross-device rename errors (EXDEV). Most systems put /tmp on tmpfs but
// /home on ext4; using a /home/.fd-plan subdir is portable.
const TEST_SLUG = "fd-test-migration"
const TMP_CWD = join(homedir(), ".fd-plan", TEST_SLUG, "work")
const NEW_DIR = join(homedir(), ".fd-plan", TEST_SLUG)

beforeEach(() => {
  // Wipe both the CWD and the new (~/.fd-plan/<slug>/) location so each
  // test starts from a clean state regardless of what prior tests left.
  if (existsSync(TMP_CWD)) rmSync(TMP_CWD, { recursive: true })
  if (existsSync(codebaseDirFor(TMP_CWD))) rmSync(codebaseDirFor(TMP_CWD), { recursive: true })
  if (existsSync(NEW_DIR)) rmSync(NEW_DIR, { recursive: true })
  mkdirSync(TMP_CWD, { recursive: true })
  _resetMigrationForTests()
})

afterEach(() => {
  if (existsSync(TMP_CWD)) rmSync(TMP_CWD, { recursive: true })
  if (existsSync(NEW_DIR)) rmSync(NEW_DIR, { recursive: true })
})

function codebaseDirFor(directory: string): string {
  // Replicate codebaseDir() without importing it (avoids re-init during cleanup)
  const { basename, join } = require("path")
  const { homedir } = require("os")
  return join(homedir(), ".fd-plan", basename(directory), ".codebase")
}

describe("codebaseDir", () => {
  it("returns path under ~/.fd-plan/<slug>/.codebase/ derived from directory basename", () => {
    const result = codebaseDir(TMP_CWD)
    expect(result).toBe(join(homedir(), ".fd-plan", "work", ".codebase"))
  })

  it("appends filename when provided", () => {
    const result = codebaseDir(TMP_CWD, "AUDIT.jsonl")
    expect(result).toBe(join(homedir(), ".fd-plan", "work", ".codebase", "AUDIT.jsonl"))
  })
})

describe("migrateIfNeeded", () => {
  it("is a no-op when no old .codebase/ exists", () => {
    const oldDir = join(TMP_CWD, ".codebase")
    expect(existsSync(oldDir)).toBe(false)
    migrateIfNeeded(TMP_CWD)
    const newDir = codebaseDir(TMP_CWD)
    expect(existsSync(newDir)).toBe(false)
  })

  it("moves a file from old to new location", () => {
    const oldDir = join(TMP_CWD, ".codebase")
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, "AUDIT.jsonl"), '{"event":"test"}\n', "utf-8")

    migrateIfNeeded(TMP_CWD)

    expect(existsSync(join(oldDir, "AUDIT.jsonl"))).toBe(false)
    const newPath = codebaseDir(TMP_CWD, "AUDIT.jsonl")
    expect(existsSync(newPath)).toBe(true)
    expect(readFileSync(newPath, "utf-8")).toBe('{"event":"test"}\n')
  })

  it("creates the new directory if missing", () => {
    const oldDir = join(TMP_CWD, ".codebase")
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, "AUDIT.jsonl"), "data", "utf-8")

    migrateIfNeeded(TMP_CWD)

    expect(existsSync(codebaseDir(TMP_CWD))).toBe(true)
  })

  it("does not overwrite files that already exist at the new location", () => {
    const oldDir = join(TMP_CWD, ".codebase")
    const newDir = codebaseDir(TMP_CWD)
    mkdirSync(oldDir, { recursive: true })
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(oldDir, "AUDIT.jsonl"), "old-data", "utf-8")
    writeFileSync(join(newDir, "AUDIT.jsonl"), "new-data", "utf-8")

    migrateIfNeeded(TMP_CWD)

    expect(readFileSync(join(newDir, "AUDIT.jsonl"), "utf-8")).toBe("new-data")
  })

  it("writes a MIGRATION.jsonl marker", () => {
    const oldDir = join(TMP_CWD, ".codebase")
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, "AUDIT.jsonl"), "data", "utf-8")

    migrateIfNeeded(TMP_CWD)

    const marker = join(codebaseDir(TMP_CWD), "MIGRATION.jsonl")
    expect(existsSync(marker)).toBe(true)
    expect(readFileSync(marker, "utf-8")).toContain("AUDIT.jsonl")
  })

  it("unlinks a symlinked .codebase/ instead of leaving a dangling symlink", () => {
    const realTarget = join(TMP_CWD, "real-codebase-target")
    mkdirSync(realTarget, { recursive: true })
    writeFileSync(join(realTarget, "AUDIT.jsonl"), "data", "utf-8")

    const oldDir = join(TMP_CWD, ".codebase")
    symlinkSync(realTarget, oldDir)

    migrateIfNeeded(TMP_CWD)

    expect(existsSync(oldDir)).toBe(false)
    expect(existsSync(codebaseDir(TMP_CWD, "AUDIT.jsonl"))).toBe(true)
  })
})