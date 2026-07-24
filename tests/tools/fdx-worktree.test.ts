import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import type { ToolContext } from "@opencode-ai/plugin"
import { fdxWorktreeTool } from "@/tools/fdx-worktree"

// Use a stable parent so /tmp/fd-worktrees/ can be cleared once per test.
const ROOT = "/tmp"
const WORKTREE_PARENT = join(ROOT, "fd-worktrees")

// Smoke test: git must be available. Skip everything if not.
const HAS_GIT = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
})()

let TMP = "" // fresh per test

const ctx = (): ToolContext => ({
  directory: TMP,
  sessionID: "test",
  messageID: "test",
  agent: "test",
  worktree: TMP,
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
})

function makeRepo(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
  execFileSync("git", ["init", "-q", "-b", "main", TMP])
  execFileSync("git", ["config", "user.email", "test@test"], { cwd: TMP })
  execFileSync("git", ["config", "user.name", "test"], { cwd: TMP })
  writeFileSync(join(TMP, "README.md"), "init", "utf-8")
  execFileSync("git", ["add", "-A"], { cwd: TMP })
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: TMP })
}

beforeEach(() => {
  TMP = join(ROOT, `fdx-worktree-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  // Clear any leftover fd-worktrees from a previous run.
  if (existsSync(WORKTREE_PARENT)) rmSync(WORKTREE_PARENT, { recursive: true })
  if (HAS_GIT) makeRepo()
})

afterEach(() => {
  if (existsSync(TMP)) {
    try {
      // Best-effort: prune worktrees registered against this TMP's main repo.
      const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: TMP,
        encoding: "utf-8",
      })
      for (const line of out.split("\n")) {
        if (line.startsWith("worktree ")) {
          try {
            execFileSync("git", ["worktree", "remove", "--force", line.slice(9)], {
              cwd: TMP,
              stdio: "ignore",
            })
          } catch {}
        }
      }
    } catch {}
    rmSync(TMP, { recursive: true })
  }
  if (existsSync(WORKTREE_PARENT)) rmSync(WORKTREE_PARENT, { recursive: true })
})

const itIfGit = HAS_GIT ? it : it.skip

describe("fdx-worktree tool", () => {
  itIfGit("create on fresh repo makes worktree and branch", async () => {
    const result = await fdxWorktreeTool.execute(
      { action: "create", topic: "auth-phase-1", phase: 1 },
      ctx(),
    )
    expect(result).toContain("OK:")
  })

  itIfGit("create idempotent on second call", async () => {
    await fdxWorktreeTool.execute({ action: "create", topic: "auth-phase-1", phase: 1 }, ctx())
    const result = await fdxWorktreeTool.execute(
      { action: "create", topic: "auth-phase-1", phase: 1 },
      ctx(),
    )
    expect(result).toContain("already exists")
  })

  itIfGit("create refuses non-empty unregistered dir (does NOT force-delete user data)", async () => {
    // First create sets up a registered worktree.
    await fdxWorktreeTool.execute({ action: "create", topic: "auth-phase-1", phase: 1 }, ctx())
    const wtPath = join(WORKTREE_PARENT, `${TMP.split("/").pop()}-auth-phase-1-1`)
    // Force the worktree registration away: prune leaves the worktree dir
    // registered but the underlying branch detached. Then re-stage:
    // delete the dir and recreate as unregistered, non-empty.
    try {
      execFileSync("git", ["worktree", "remove", "--force", wtPath], { cwd: TMP, stdio: "ignore" })
    } catch {}
    // The dir now should be gone. Recreate as unregistered + non-empty.
    mkdirSync(wtPath, { recursive: true })
    writeFileSync(join(wtPath, "user-data.txt"), "important", "utf-8")
    const result = await fdxWorktreeTool.execute(
      { action: "create", topic: "auth-phase-1", phase: 1 },
      ctx(),
    )
    expect(result).toContain("non-empty")
    expect(result).toContain("refusing to overwrite")
    expect(existsSync(join(wtPath, "user-data.txt"))).toBe(true)
  })

  itIfGit("rejects non-integer phase (NaN)", async () => {
    const result = await fdxWorktreeTool.execute(
      { action: "create", topic: "auth-phase-1", phase: Number.NaN as unknown as number },
      ctx(),
    )
    expect(result).toContain("phase must be an integer")
  })

  itIfGit("rejects non-integer phase (Infinity)", async () => {
    const result = await fdxWorktreeTool.execute(
      { action: "create", topic: "auth-phase-1", phase: Number.POSITIVE_INFINITY },
      ctx(),
    )
    expect(result).toContain("phase must be an integer")
  })

  itIfGit("rejects non-integer phase in merge", async () => {
    const result = await fdxWorktreeTool.execute(
      { action: "merge", topic: "auth-phase-1", phase: 1.5 as unknown as number },
      ctx(),
    )
    expect(result).toContain("phase must be an integer")
  })

  itIfGit("merge on clean merge returns OK", async () => {
    await fdxWorktreeTool.execute({ action: "create", topic: "auth-phase-1", phase: 1 }, ctx())
    const wtPath = join(WORKTREE_PARENT, `${TMP.split("/").pop()}-auth-phase-1-1`)
    writeFileSync(join(wtPath, "feature.md"), "feature work", "utf-8")
    execFileSync("git", ["add", "-A"], { cwd: wtPath })
    execFileSync("git", ["commit", "-q", "-m", "feature"], { cwd: wtPath })
    const result = await fdxWorktreeTool.execute(
      { action: "merge", topic: "auth-phase-1", phase: 1 },
      ctx(),
    )
    expect(result).toContain("OK:")
  })

  itIfGit("merge with conflict returns CONFLICT and aborts cleanly", async () => {
    await fdxWorktreeTool.execute({ action: "create", topic: "auth-phase-1", phase: 1 }, ctx())
    const wtPath = join(WORKTREE_PARENT, `${TMP.split("/").pop()}-auth-phase-1-1`)
    writeFileSync(join(wtPath, "README.md"), "worktree version", "utf-8")
    execFileSync("git", ["add", "-A"], { cwd: wtPath })
    execFileSync("git", ["commit", "-q", "-m", "worktree change"], { cwd: wtPath })
    writeFileSync(join(TMP, "README.md"), "main version", "utf-8")
    execFileSync("git", ["commit", "-q", "-am", "main change"], { cwd: TMP })
    const result = await fdxWorktreeTool.execute(
      { action: "merge", topic: "auth-phase-1", phase: 1 },
      ctx(),
    )
    expect(result).toContain("CONFLICT")
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: TMP, encoding: "utf-8" })
    expect(status.trim()).toBe("")
  })

  itIfGit("merge refuses to run on dirty target", async () => {
    writeFileSync(join(TMP, "uncommitted.txt"), "dirty", "utf-8")
    const result = await fdxWorktreeTool.execute(
      { action: "merge", topic: "auth-phase-1", phase: 1 },
      ctx(),
    )
    expect(result).toContain("uncommitted changes")
  })

  itIfGit("list returns empty array on no fd-* worktrees", async () => {
    const result = await fdxWorktreeTool.execute({ action: "list" }, ctx())
    expect(result).toBe("[]")
  })

  itIfGit("cleanup-all calls git worktree list at most once even with multiple worktrees", async () => {
    await fdxWorktreeTool.execute({ action: "create", topic: "a-phase-1", phase: 1 }, ctx())
    await fdxWorktreeTool.execute({ action: "create", topic: "a-phase-2", phase: 2 }, ctx())

    const childProcess = require("node:child_process")
    const spy = vi.spyOn(childProcess, "execFileSync")
    const result = await fdxWorktreeTool.execute({ action: "cleanup-all" }, ctx())
    expect(result).toContain("OK:")
    const listCalls = spy.mock.calls.filter(
      (c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && c[1][0] === "worktree" && c[1][1] === "list",
    )
    expect(listCalls.length).toBeLessThanOrEqual(1)
    spy.mockRestore()
  })
})
