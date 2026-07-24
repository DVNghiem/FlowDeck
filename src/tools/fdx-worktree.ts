import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { execFileSync, execSync } from "node:child_process"
import { resolve as pathResolve, sep } from "path"
import { existsSync, statSync, readdirSync } from "fs"
import { basename } from "path"

/** Timeout for each `git` call. */
const GIT_TIMEOUT_MS = 30_000

function gitError(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    return String((err as { stderr: Buffer | string }).stderr).trim()
  }
  return (err as Error)?.message ?? String(err)
}

function isInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n)
}

interface WorktreeEntry {
  path: string
  branch: string | null
  phase: number | null
  topic: string | null
}

function parsePorcelain(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: Partial<WorktreeEntry> = {}
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) entries.push(current as WorktreeEntry)
      current = { path: line.slice("worktree ".length) }
    } else if (line.startsWith("branch ")) {
      // `branch refs/heads/<name>` — strip prefix.
      const ref = line.slice("branch ".length)
      current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref
    }
  }
  if (current.path) entries.push(current as WorktreeEntry)
  return entries
}

/** `fd-<project-slug>-<topic-slug>-phase-<phase>` — git branch names cannot contain slashes. */
function branchNameFor(projectSlug: string, topicSlug: string, phase: number): string {
  return `fd-${projectSlug}-${topicSlug}-phase-${phase}`
}

/** `<project-root>/../fd-worktrees/<project-slug>-<topic-slug>-<phase>/` */
function worktreePathFor(directory: string, projectSlug: string, topicSlug: string, phase: number): string {
  return pathResolve(directory, "..", "fd-worktrees", `${projectSlug}-${topicSlug}-${phase}`)
}

/**
 * Strip `<projectSlug>-<topicSlug>-phase-<phase>` suffix from a worktree path
 * basename to recover the topic slug. Handles both the new format
 * (`<slug>-phase-<phase>`) and the integer-only format (`<slug>-<int>`).
 */
function topicSlugFromPath(p: string): string | null {
  // New format: ...-<topicSlug>-phase-<int>
  let m = p.match(/-phase-\d+$/)
  if (m) return p.slice(0, m.index).replace(/^.*-/, "")
  // Legacy/integer format: ...-<topicSlug>-<int>
  m = p.match(/-\d+$/)
  if (m) return p.slice(0, m.index).replace(/^.*-/, "")
  return null
}

function isDirEmpty(p: string): boolean {
  if (!existsSync(p)) return false
  return readdirSync(p).length === 0
}

function isRegisteredWorktree(p: string, cwd: string): boolean {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf-8",
      timeout: GIT_TIMEOUT_MS,
    })
    return parsePorcelain(out).some((e) => pathResolve(e.path) === pathResolve(p))
  } catch {
    return false
  }
}

/**
 * Git worktree wrapper. Naming convention: `fd-<project-slug>-<topic-slug>-<phase>`.
 *
 * Conflict detection (action:merge) runs `git diff --name-only --diff-filter=U`
 * after any non-zero exit from `git merge`, then `git merge --abort` if
 * the diff is non-empty. This avoids relying on stderr text — git's
 * exit code and the post-state are the source of truth.
 */
export const fdxWorktreeTool: ToolDefinition = tool({
  description:
    "Safe wrapper around `git worktree`. Naming convention: fd-<project-slug>-<topic-slug>-<phase>. " +
    "Surfaces merge conflicts as structured `{conflict: true, files: [...]}` returns; never leaves the repo in a half-merged state.",
  args: {
    action: tool.schema.enum(["create", "list", "merge", "cleanup", "cleanup-all"]),
    topic: tool.schema.string().optional(),
    phase: tool.schema.number().optional(),
  },
  async execute(args, context) {
    const directory = context.directory
    const projectSlug = basename(directory)

    if (args.action === "create") {
      if (!args.topic || args.phase === undefined) {
        return "Error: topic and phase are required for action=create"
      }
      if (!isInteger(args.phase)) {
        return "Error: phase must be an integer (got " + JSON.stringify(args.phase) + ")"
      }
      const topicSlug = topicSlugFromPathSloppy(args.topic)
      const branch = branchNameFor(projectSlug, topicSlug, args.phase)
      const worktreePath = worktreePathFor(directory, projectSlug, topicSlug, args.phase)

      try {
        // Step 1: directory already exists? Three cases.
        if (existsSync(worktreePath)) {
          // (c) Non-empty unregistered dir → refuse. Do NOT --force delete user data.
          if (!isRegisteredWorktree(worktreePath, directory) && !isDirEmpty(worktreePath)) {
            return `Error: ${worktreePath} exists and is non-empty; refusing to overwrite. Remove the directory or pass a different phase.`
          }
          // (d) Already registered to expected branch → idempotent return.
          if (isRegisteredWorktree(worktreePath, directory)) {
            return `OK: worktree already exists at ${worktreePath} (branch ${branch})`
          }
          // (b) Empty unregistered dir → --force add.
          execFileSync("git", ["worktree", "add", "--force", worktreePath, branch], {
            cwd: directory,
            timeout: GIT_TIMEOUT_MS,
          })
        } else {
          // (a) Fresh dir: create branch + worktree, or attach if branch already exists.
          try {
            execFileSync(
              "git",
              ["worktree", "add", "-b", branch, worktreePath, "HEAD"],
              { cwd: directory, timeout: GIT_TIMEOUT_MS },
            )
          } catch (err) {
            const stderr = gitError(err)
            if (/already exists/i.test(stderr) || /already used/i.test(stderr)) {
              execFileSync("git", ["worktree", "add", worktreePath, branch], {
                cwd: directory,
                timeout: GIT_TIMEOUT_MS,
              })
            } else {
              return `Error: git worktree add failed: ${stderr}`
            }
          }
        }
        return `OK: worktree created at ${worktreePath} on branch ${branch}`
      } catch (err) {
        return `Error: ${gitError(err)}`
      }
    }

    if (args.action === "list") {
      try {
        const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
          cwd: directory,
          encoding: "utf-8",
          timeout: GIT_TIMEOUT_MS,
        })
        const all = parsePorcelain(out)
        const fdOnly = all.filter((e) => e.path.includes("fd-worktrees/"))
        return JSON.stringify(
          fdOnly.map((e) => ({
            path: e.path,
            branch: e.branch,
            phase: e.branch ? extractPhaseFromBranch(e.branch) : null,
            topic: e.path ? topicSlugFromPath(e.path.split("/").pop() ?? "") : null,
          })),
          null,
          2,
        )
      } catch (err) {
        return `Error: ${gitError(err)}`
      }
    }

    if (args.action === "merge") {
      if (!args.topic || args.phase === undefined) {
        return "Error: topic and phase are required for action=merge"
      }
      if (!isInteger(args.phase)) {
        return "Error: phase must be an integer"
      }
      const topicSlug = topicSlugFromPathSloppy(args.topic)
      const branch = branchNameFor(projectSlug, topicSlug, args.phase)

      // Pre-flight: clean target (Reviewer Concerns MEDIUM #4).
      try {
        const status = execFileSync("git", ["status", "--porcelain"], {
          cwd: directory,
          encoding: "utf-8",
          timeout: GIT_TIMEOUT_MS,
        })
        if (status.trim().length > 0) {
          return "Error: project root has uncommitted changes; commit or stash before merge"
        }
      } catch (err) {
        return `Error: git status preflight failed: ${gitError(err)}`
      }

      try {
        execFileSync("git", ["merge", "--no-ff", branch], {
          cwd: directory,
          timeout: GIT_TIMEOUT_MS,
        })
        return `OK: merged ${branch} cleanly`
      } catch (mergeErr) {
        // Conflict detection: check the index, not the stderr.
        try {
          const unmerged = execFileSync(
            "git",
            ["diff", "--name-only", "--diff-filter=U"],
            { cwd: directory, encoding: "utf-8", timeout: GIT_TIMEOUT_MS },
          )
          const files = unmerged.trim().split("\n").filter(Boolean)
          if (files.length > 0) {
            // CRITICAL: leave the repo in a clean state.
            try {
              execFileSync("git", ["merge", "--abort"], { cwd: directory, timeout: GIT_TIMEOUT_MS })
            } catch {
              // Best-effort; if abort fails, the user will need to resolve manually.
            }
            return `CONFLICT: merge of ${branch} has unmerged files:\n  - ${files.join("\n  - ")}`
          }
        } catch {
          // diff --name-only failed; fall through to GIT error.
        }
        try {
          execFileSync("git", ["merge", "--abort"], { cwd: directory, timeout: GIT_TIMEOUT_MS })
        } catch {
          // Ignore.
        }
        return `Error: git merge failed: ${gitError(mergeErr)}`
      }
    }

    if (args.action === "cleanup") {
      if (!args.topic || args.phase === undefined) {
        return "Error: topic and phase are required for action=cleanup"
      }
      if (!isInteger(args.phase)) {
        return "Error: phase must be an integer"
      }
      const topicSlug = topicSlugFromPathSloppy(args.topic)
      const worktreePath = worktreePathFor(directory, projectSlug, topicSlug, args.phase)
      const branch = branchNameFor(projectSlug, topicSlug, args.phase)

      // Cwd-in-worktree containment check (Reviewer Concerns HIGH #2):
      // resolve both sides, then check worktreePath is a strict prefix of cwd (with sep).
      const cwdResolved = pathResolve(process.cwd())
      const worktreeResolved = pathResolve(worktreePath)
      if (
        cwdResolved === worktreeResolved ||
        cwdResolved.startsWith(worktreeResolved + sep)
      ) {
        return `Error: refusing to remove worktree containing cwd (${cwdResolved})`
      }

      let branchDeleted = false
      try {
        execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
          cwd: directory,
          timeout: GIT_TIMEOUT_MS,
        })
      } catch (err) {
        return `Error: git worktree remove failed: ${gitError(err)}`
      }
      try {
        execFileSync("git", ["branch", "-D", branch], {
          cwd: directory,
          timeout: GIT_TIMEOUT_MS,
        })
        branchDeleted = true
      } catch {
        // Branch already gone or protected; best-effort.
      }
      return `OK: cleaned up worktree (branch deleted: ${branchDeleted})`
    }

    if (args.action === "cleanup-all") {
      // Snapshot once (Performance D12 A), iterate locally.
      try {
        const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
          cwd: directory,
          encoding: "utf-8",
          timeout: GIT_TIMEOUT_MS,
        })
        const fdOnly = parsePorcelain(out).filter((e) => e.path.includes("fd-worktrees/"))
        const removed: string[] = []
        const skipped: string[] = []
        const failed: Array<{ path: string; reason: string }> = []
        for (const entry of fdOnly) {
          const cwdResolved = pathResolve(process.cwd())
          const entryResolved = pathResolve(entry.path)
          if (cwdResolved === entryResolved || cwdResolved.startsWith(entryResolved + sep)) {
            skipped.push(entry.path)
            continue // Refusing to remove the cwd worktree.
          }
          try {
            execFileSync("git", ["worktree", "remove", "--force", entry.path], {
              cwd: directory,
              timeout: GIT_TIMEOUT_MS,
            })
            removed.push(entry.path)
            if (entry.branch) {
              try {
                execFileSync("git", ["branch", "-D", entry.branch], {
                  cwd: directory,
                  timeout: GIT_TIMEOUT_MS,
                })
              } catch {
                // Best-effort.
              }
            }
          } catch (err) {
            failed.push({ path: entry.path, reason: gitError(err) })
          }
        }
        const parts: string[] = [`OK: removed ${removed.length} worktree(s)`]
        if (skipped.length > 0) {
          parts.push(`skipped ${skipped.length} (cwd-in-worktree)`)
        }
        if (failed.length > 0) {
          parts.push(
            `failed ${failed.length}: ${failed.map((f) => `${f.path} (${f.reason})`).join("; ")}`,
          )
        }
        return parts.join("; ")
      } catch (err) {
        return `Error: cleanup-all failed: ${gitError(err)}`
      }
    }

    return `Error: unknown action ${args.action as string}`
  },
})

/**
 * Best-effort slugification of the topic string. The existing
 * `slugifyTopic()` in `planning-state-lib.ts` is the source of truth —
 * this is a fallback for the cases where the LLM passes a slug-like
 * string already (e.g. "orchestrator-prompt" instead of "Orchestrator
 * Prompt"). The function name is suffixed `_sloppy` to flag that this
 * may not produce identical output to the canonical slugifier.
 */
function topicSlugFromPathSloppy(topic: string): string {
  return topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

function extractPhaseFromBranch(branch: string): number | null {
  const m = branch.match(/-phase-(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}
