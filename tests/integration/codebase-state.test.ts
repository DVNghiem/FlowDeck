import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "child_process"
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
} from "fs"
import { join } from "path"
import { homedir } from "os"
import { randomUUID } from "crypto"
import {
  codebaseDir,
  _resetMigrationForTests,
  codebaseStateTool,
} from "../../src/tools/codebase-state"
import type { ToolContext, ToolResult } from "@opencode-ai/plugin"

// ─── Test layout (collision-safe) ──────────────────────────────────────────
//
// TMP_CWD hosts the legacy <repo>/.codebase/ during the test. NEW_DIR is the
// post-migration location (~/.fd-plan/<slug>/.codebase/) that codebase-state
// reads from. Both are scoped under a per-process UUID fixture root and use
// unlikely project basenames so this suite can never wipe data belonging to
// a real FlowDeck project whose `basename(cwd)` happens to be a common word
// (the prior fixture used the basename `integration`, which is plausible for
// a real monorepo subdir). `_resetMigrationForTests()` resets the
// per-process memoization cache so tests don't accidentally inherit state.
const FIXTURE_ROOT = join(homedir(), ".fd-plan", "fd-int-migration-" + randomUUID().slice(0, 8))
const PRIMARY_SLUG = "primary-" + randomUUID().slice(0, 8)
const OTHER_SLUG = "other-" + randomUUID().slice(0, 8)
const TMP_CWD = join(FIXTURE_ROOT, PRIMARY_SLUG)
const TMP_CWD_OTHER = join(FIXTURE_ROOT, OTHER_SLUG)
const NEW_DIR = codebaseDir(TMP_CWD)
const NEW_DIR_OTHER = codebaseDir(TMP_CWD_OTHER)

beforeEach(() => {
  for (const dir of [TMP_CWD, TMP_CWD_OTHER, NEW_DIR, NEW_DIR_OTHER]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(TMP_CWD, { recursive: true })
  mkdirSync(TMP_CWD_OTHER, { recursive: true })
  _resetMigrationForTests()
})

afterEach(() => {
  // Wipe everything this suite might have written. Use the exact UUID-scoped
  // paths above so unrelated real projects cannot be affected even if their
  // basenames happen to look like ours.
  for (const dir of [TMP_CWD, TMP_CWD_OTHER, NEW_DIR, NEW_DIR_OTHER]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Helper: run a snippet in a fresh child process with cwd set. ──────────
//
// This is how we exercise true cross-process behavior for §6 (slug
// determinism across processes) and §7 (marker already present from a prior
// process). In-process memoization would hide both bugs.
function runInChild(snippet: string, cwd: string): { stdout: string; status: number } {
  // Resolve the source path in the parent so the child can import it via
  // an absolute path (no module-resolution games in the bun -e sandbox).
  const srcPath = join(import.meta.dirname, "..", "..", "src", "tools", "codebase-state.ts")
  const script = `import { migrateIfNeeded, codebaseDir } from ${JSON.stringify(srcPath)}; ${snippet}`
  const result = spawnSync("bun", ["-e", script], {
    cwd,
    encoding: "utf-8",
  })
  if (result.status !== 0) {
    throw new Error(
      `child failed (status=${result.status}):\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }
  return { stdout: result.stdout, status: result.status ?? 0 }
}



// ─── ToolContext stub ───────────────────────────────────────────────────────
//
// `codebaseStateTool.execute` only reads `context.directory` (the source
// proves it: `const dir = context.directory ?? process.cwd()`). The
// remaining fields exist to satisfy the `ToolContext` type — pass empty
// strings and a no-op `metadata`. We do not need `abort` because the
// executor does not check it.
function fakeContext(directory: string): ToolContext {
  return {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  } as unknown as ToolContext
}

// `codebaseStateTool.execute` returns `ToolResult` (string or { output, ... }).
// The codebase tool always returns JSON.stringify of its result, so in
// practice the string form is what we get — but defensively unwrap the
// object form too.
function unwrap(result: ToolResult): string {
  return typeof result === "string" ? result : result.output
}

// ─── §2/§5: End-to-end "read after migration" via the tool ─────────────────

describe("codebase-state tool — end-to-end read after migration", () => {
  it("migrates on first read and returns content from the new location", async () => {
    // §1: pre-populate the legacy <repo>/.codebase/ with two files.
    const oldDir = join(TMP_CWD, ".codebase")
    mkdirSync(oldDir, { recursive: true })
    const auditLine = '{"event":"audit","ts":"2026-07-27T00:00:00Z"}\n'
    const indexBody = "# CODEBASE_INDEX\n\nThis is the integration fixture.\n"
    writeFileSync(join(oldDir, "AUDIT.jsonl"), auditLine, "utf-8")
    writeFileSync(join(oldDir, "CODEBASE_INDEX.md"), indexBody, "utf-8")

    // §2: invoke the tool's `read` action with context.directory = TMP_CWD.
    const raw = unwrap(await codebaseStateTool.execute(
      {
        action: "read",
        files: ["AUDIT.jsonl", "CODEBASE_INDEX.md"],
      },
      fakeContext(TMP_CWD),
    ))
    const parsed = JSON.parse(raw) as Record<
      string,
      string | { error: string }
    >

    // §3: the returned content matches what we wrote.
    expect(parsed["AUDIT.jsonl"]).toBe(auditLine)
    expect(parsed["CODEBASE_INDEX.md"]).toBe(indexBody)

    // §4: the old paths no longer exist.
    expect(existsSync(join(oldDir, "AUDIT.jsonl"))).toBe(false)
    expect(existsSync(join(oldDir, "CODEBASE_INDEX.md"))).toBe(false)

    // Sanity: the new location holds the files (and a MIGRATION marker).
    expect(existsSync(codebaseDir(TMP_CWD, "AUDIT.jsonl"))).toBe(true)
    expect(existsSync(codebaseDir(TMP_CWD, "CODEBASE_INDEX.md"))).toBe(true)
    expect(
      existsSync(join(codebaseDir(TMP_CWD), "MIGRATION.jsonl")),
    ).toBe(true)
  })

  // §5: same realpath+unlink semantics, but exercised through the tool.
  it("migrates a symlinked legacy .codebase/ and unlinks the dangling symlink", async () => {
    const realTarget = join(TMP_CWD, "real-codebase-target")
    mkdirSync(realTarget, { recursive: true })
    writeFileSync(join(realTarget, "AUDIT.jsonl"), "symlinked\n", "utf-8")

    const oldDir = join(TMP_CWD, ".codebase")
    symlinkSync(realTarget, oldDir)

    const raw = unwrap(await codebaseStateTool.execute(
      { action: "read", files: ["AUDIT.jsonl"] },
      fakeContext(TMP_CWD),
    ))
    const parsed = JSON.parse(raw) as Record<string, string>

    expect(parsed["AUDIT.jsonl"]).toBe("symlinked\n")
    // The symlink itself is gone — no dangling pointer for the user.
    expect(existsSync(oldDir)).toBe(false)
    expect(existsSync(codebaseDir(TMP_CWD, "AUDIT.jsonl"))).toBe(true)
  })
})

// ─── §6: Slug determinism across parallel processes ────────────────────────

describe("codebase-state — slug determinism", () => {
  it("derives stable, project-specific paths across processes", () => {
    const a = runInChild(
      `process.stdout.write(codebaseDir(process.cwd()))`,
      TMP_CWD,
    )
    const b = runInChild(
      `process.stdout.write(codebaseDir(process.cwd()))`,
      TMP_CWD,
    )
    const other = runInChild(
      `process.stdout.write(codebaseDir(process.cwd()))`,
      TMP_CWD_OTHER,
    )

    expect(a.status).toBe(0)
    expect(b.status).toBe(0)
    expect(other.status).toBe(0)
    expect(a.stdout).toBe(b.stdout)
    expect(a.stdout).toBe(codebaseDir(TMP_CWD))
    expect(other.stdout).toBe(codebaseDir(TMP_CWD_OTHER))
    expect(other.stdout).not.toBe(a.stdout)
  })
})

// ─── §7: Second process, marker already present, no overwrite ──────────────

describe("codebase-state — cross-process idempotence", () => {
  it("does not overwrite a file that the migration marker already covers", () => {
    // Pre-populate the NEW location with both the file (with a sentinel
    // value) and a MIGRATION.jsonl marker that lists it. This mimics the
    // state a second process finds after a prior process migrated.
    const newDir = codebaseDir(TMP_CWD)
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(newDir, "AUDIT.jsonl"), "sentinel", "utf-8")
    writeFileSync(join(newDir, "MIGRATION.jsonl"), "AUDIT.jsonl\n", "utf-8")

    // Also seed the OLD location with different content. A naive migration
    // would clobber the sentinel; the marker guard must prevent that.
    const oldDir = join(TMP_CWD, ".codebase")
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, "AUDIT.jsonl"), "stale-old", "utf-8")

    // A fresh process — no in-process memoization, just the on-disk marker.
    runInChild(`migrateIfNeeded(process.cwd())`, TMP_CWD)

    expect(readFileSync(join(newDir, "AUDIT.jsonl"), "utf-8")).toBe("sentinel")
  })

  it("a second process leaves the first process's file untouched", () => {
    // The first child migrates. The second child runs migration again
    // against an already-migrated layout — must not destroy the file
    // even though the old dir is empty.
    const oldDir = join(TMP_CWD, ".codebase")
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, "AUDIT.jsonl"), "first-process\n", "utf-8")

    runInChild(`migrateIfNeeded(process.cwd())`, TMP_CWD)

    // After the first child: file is at the new location, marker is set.
    expect(existsSync(codebaseDir(TMP_CWD, "AUDIT.jsonl"))).toBe(true)
    const firstContent = readFileSync(
      codebaseDir(TMP_CWD, "AUDIT.jsonl"),
      "utf-8",
    )
    expect(firstContent).toBe("first-process\n")

    // A second child re-derives the path and re-runs migration. It must
    // not destroy the file, even though the old dir is already empty.
    runInChild(`migrateIfNeeded(process.cwd())`, TMP_CWD)
    expect(
      readFileSync(codebaseDir(TMP_CWD, "AUDIT.jsonl"), "utf-8"),
    ).toBe(firstContent)
  })
})
