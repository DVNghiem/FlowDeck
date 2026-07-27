import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  renameSync,
  lstatSync,
  realpathSync,
  unlinkSync,
  appendFileSync,
} from "fs"
import { join } from "path"
import { planningDir } from "./planning-state-lib"

/**
 * Returns the absolute path of the codebase directory for a given project.
 *
 * Storage location: `~/.fd-plan/<project-slug>/.codebase/`. This co-locates
 * codebase knowledge with STATE.md, CODEBASE_INDEX.md, and the per-topic
 * planning artifacts. Outside the repo, so knowledge survives project moves
 * and is naturally gitignored.
 *
 * @param directory - The project root directory (typically `context.directory`
 *   or `process.cwd()`). The slug is derived via `basename(directory)`.
 * @param filename - Optional filename to append. If omitted, returns the
 *   directory path.
 * @returns Absolute path to `~/.fd-plan/<slug>/.codebase[/<filename>]`.
 */
export function codebaseDir(directory: string, filename?: string): string {
  const base = join(planningDir(directory), ".codebase")
  return filename ? join(base, filename) : base
}

/**
 * Tracks whether `migrateIfNeeded` has run in this process. One migration
 * per process keeps `exists` probes cheap.
 */
let migrationChecked = false

/**
 * Test-only: reset the per-process migration memoization.
 */
export function _resetMigrationForTests(): void {
  migrationChecked = false
}

/**
 * One-time migration from the legacy `<repo>/.codebase/` location to
 * `~/.fd-plan/<slug>/.codebase/`.
 *
 * Idempotent across calls (memoized via `migrationChecked`) and across
 * processes (per-file `MIGRATION.jsonl` marker file). Uses
 * `fs.renameSync` (atomic on the same filesystem) to avoid the
 * copy-then-delete race window.
 *
 * Symlink case: if `<repo>/.codebase/Foo` is a symlink, the real target
 * is moved and the symlink is unlinked. This prevents the user's old
 * path from silently pointing at an empty directory after migration.
 */
export function migrateIfNeeded(directory: string): void {
  if (migrationChecked) return
  migrationChecked = true

  const oldDir = join(directory, ".codebase")
  if (!existsSync(oldDir)) return

  // Detect symlinked .codebase/ directory up front. `readdirSync` follows
  // symlinks, so a symlinked directory's children would be listed as if
  // they were direct entries — leaving the dangling symlink unless we
  // unlink the parent after moving the real target.
  const oldDirIsSymlink = lstatSync(oldDir).isSymbolicLink()

  const newDir = codebaseDir(directory)
  if (!existsSync(newDir)) {
    mkdirSync(newDir, { recursive: true })
  }

  const markerFile = join(newDir, "MIGRATION.jsonl")
  const alreadyDone = existsSync(markerFile)
    ? readFileSync(markerFile, "utf-8").split("\n").filter(Boolean)
    : []

  for (const file of readdirSync(oldDir)) {
    if (alreadyDone.includes(file)) continue
    const oldPath = join(oldDir, file)
    const newPath = codebaseDir(directory, file)
    if (existsSync(newPath)) continue

    try {
      const stat = lstatSync(oldPath)
      if (stat.isSymbolicLink()) {
        const realTarget = realpathSync(oldPath)
        renameSync(realTarget, newPath)
        unlinkSync(oldPath)
      } else {
        renameSync(oldPath, newPath)
      }
      appendFileSync(markerFile, `${file}\n`, "utf-8")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Migration failed for ${file}: ${msg}`)
    }
  }

  // After all files are moved, remove the now-empty symlinked directory
  // (if it was one) so the user doesn't see a dangling symlink.
  if (oldDirIsSymlink) {
    unlinkSync(oldDir)
  }
}

function listCodebaseFiles(directory: string): string[] {
  const base = codebaseDir(directory)
  if (!existsSync(base)) return []
  return readdirSync(base).filter(
    (f) => f.endsWith(".md") || f.endsWith(".json") || f.endsWith(".jsonl"),
  )
}

async function readCodebaseContext(
  dir: string,
  files: string[],
): Promise<Record<string, string | { error: string }>> {
  const results: Record<string, string | { error: string }> = {}
  for (const file of files) {
    const filePath = codebaseDir(dir, file)
    if (!existsSync(filePath)) {
      results[file] = { error: `File not found: ${file}` }
      continue
    }
    results[file] = readFileSync(filePath, "utf-8")
  }
  return results
}

async function updateCodebaseFile(
  dir: string,
  filename: string,
  content: string,
): Promise<Record<string, unknown>> {
  const base = codebaseDir(dir)
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  const filePath = codebaseDir(dir, filename)
  writeFileSync(filePath, content, "utf-8")
  return { success: true, file: filename, written_at: new Date().toISOString() }
}

async function codebaseExists(
  dir: string,
): Promise<{ exists: boolean; files: string[] }> {
  const base = codebaseDir(dir)
  if (!existsSync(base)) {
    return { exists: false, files: [] }
  }
  const files = listCodebaseFiles(dir)
  return { exists: true, files }
}

export const codebaseStateTool: ToolDefinition = tool({
  description:
    "Manage the codebase knowledge directory (stored at ~/.fd-plan/<slug>/.codebase/): read files, write files, check existence",
  args: {
    action: tool.schema.enum(["read", "write", "exists"]),
    files: tool.schema.array(tool.schema.string()).optional(),
    filename: tool.schema.string().optional(),
    content: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    migrateIfNeeded(dir)
    let result: unknown
    switch (args.action) {
      case "read":
        result = await readCodebaseContext(dir, args.files ?? [])
        break
      case "write":
        result = await updateCodebaseFile(dir, args.filename!, args.content!)
        break
      case "exists":
        result = await codebaseExists(dir)
        break
    }
    return JSON.stringify(result)
  },
})