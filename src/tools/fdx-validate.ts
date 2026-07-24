import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { statSync } from "fs"
import { resolve, isAbsolute } from "path"
import {
  topicTaskPath,
  topicAffectPath,
  topicPlanPath,
  readOrMissing,
} from "./planning-state-lib"

const MAX_FIELD_LENGTH = 200

/** Tokens recognized as the verb in an `affect.md` entry line. */
const RECOGNIZED_VERBS = new Set(["create", "modify", "delete"])

/**
 * Read `affect.md` and return every bullet under `## Affected Files`.
 *
 * Stops at the next same-or-higher-level heading. Skips code-fenced
 * lines and lines inside HTML comments. A malformed line is reported
 * with its 1-indexed line number.
 */
function parseAffect(
  content: string,
  projectRoot: string,
): { entries: Array<{ verb: string; path: string; absolutePath: string }>; errors: string[] } {
  const entries: Array<{ verb: string; path: string; absolutePath: string }> = []
  const errors: string[] = []
  const lines = content.split("\n")

  // Find the start of the "## Affected Files" section.
  let inSection = false
  let inFence = false
  let inComment = false
  let bulletIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()

    if (inFence) {
      if (line.startsWith("```")) inFence = false
      continue
    }
    if (line.startsWith("```")) {
      inFence = true
      continue
    }
    if (inComment) {
      if (line.includes("-->")) inComment = false
      continue
    }
    if (line.startsWith("<!--")) {
      if (!line.includes("-->")) inComment = true
      continue
    }

    if (line.startsWith("# ")) {
      inSection = false
      continue
    }
    if (line.startsWith("## ")) {
      inSection = line.toLowerCase() === "## affected files"
      continue
    }
    if (!inSection) continue
    if (!line.startsWith("- ")) continue

    const body = line.slice(2).trim()
    if (!body) {
      errors.push(`line ${i + 1}: empty entry`)
      continue
    }

    const spaceIdx = body.indexOf(" ")
    if (spaceIdx < 0) {
      errors.push(`line ${i + 1}: malformed entry (expected '<verb> <path>')`)
      continue
    }

    const verb = body.slice(0, spaceIdx).toLowerCase()
    const path = body.slice(spaceIdx + 1).trim()

    if (!path) {
      errors.push(`line ${i + 1}: missing path`)
      continue
    }
    if (!RECOGNIZED_VERBS.has(verb)) {
      errors.push(`line ${i + 1}: unknown verb '${verb}' (expected create|modify|delete)`)
      continue
    }
    if (path.includes("..")) {
      errors.push(`line ${i + 1}: path '${path}' contains '..' (refused)`)
      continue
    }
    if (path.length > MAX_FIELD_LENGTH) {
      errors.push(`line ${i + 1}: path exceeds ${MAX_FIELD_LENGTH} chars`)
      continue
    }

    const absolutePath = isAbsolute(path) ? path : resolve(projectRoot, path)
    entries.push({ verb, path, absolutePath })
    bulletIndex++
  }

  return { entries, errors }
}

/**
 * Pre-execute consistency check for topic artifacts.
 *
 * Validates:
 *   1. task.md, affect.md, plan.md all exist
 *   2. affect.md "Affected Files" entries point to real files (skip `create`)
 *   3. plan.md mtime >= task.md mtime (plan not stale)
 *
 * Returns a one-line result string in the same shape as the existing
 * FlowDeck tools: a successful path returns "OK" + summary, a failed
 * path returns a multi-line list of errors.
 */
export const fdxValidateTool: ToolDefinition = tool({
  description:
    "Pre-execute consistency check for topic artifacts. Call before creating a worktree to confirm task/affect/plan are coherent. Returns OK or a list of errors.",
  args: {
    action: tool.schema.enum(["pre-execute"]),
    topic: tool.schema.string(),
  },
  async execute(args, context) {
    if (args.action !== "pre-execute") {
      return `Error: unknown action ${args.action as string}`
    }

    const errors: string[] = []
    const taskPath = topicTaskPath(context.directory, args.topic)
    const affectPath = topicAffectPath(context.directory, args.topic)
    const planPath = topicPlanPath(context.directory, args.topic)

    // Step 1: required files exist
    for (const [name, p] of [
      ["task.md", taskPath],
      ["affect.md", affectPath],
      ["plan.md", planPath],
    ] as const) {
      const r = readOrMissing(p)
      if (!r.exists) errors.push(`${name} missing`)
    }
    if (errors.length > 0) {
      return `Error: validation failed:\n  - ${errors.join("\n  - ")}`
    }

    // Step 2: affect entries are real
    const affectContent = readFileOrEmpty(affectPath)
    const { entries, errors: parseErrors } = parseAffect(affectContent, context.directory)
    for (const e of parseErrors) errors.push(e)

    for (const entry of entries) {
      if (entry.verb === "create") continue
      try {
        const s = statSync(entry.absolutePath)
        if (!s.isFile()) errors.push(`${entry.absolutePath} is not a file`)
      } catch {
        errors.push(`${entry.absolutePath} not found`)
      }
    }

    // Step 3: plan not stale
    try {
      const taskStat = statSync(taskPath)
      const planStat = statSync(planPath)
      if (planStat.mtimeMs < taskStat.mtimeMs) {
        errors.push("plan.md is older than task.md — re-plan required")
      }
    } catch (err) {
      errors.push(`stat failure on task/plan: ${(err as Error).message}`)
    }

    if (errors.length > 0) {
      return `Error: validation failed:\n  - ${errors.join("\n  - ")}`
    }

    return `OK: ${entries.length} affect entries validated; plan is fresh`
  },
})

function readFileOrEmpty(path: string): string {
  const r = readOrMissing(path)
  return r.exists ? r.content : ""
}
