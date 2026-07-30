import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { statSync } from "fs"
import { resolve, isAbsolute } from "path"
import {
  topicTaskPath,
  topicAffectPath,
  topicPlanPath,
  topicArchitecturePath,
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

/** Accepted values under `## Risk Level` in `affect.md`. */
const RISK_LEVELS = new Set(["low", "medium", "high"])

/** `- path/to/file.ts (modify)` — a path followed by a parenthesized verb. */
const AFFECTED_FILE_LINE = /^-\s+\S.*\((?:modify|create|delete)\)$/

/** `## Wave 1` — a plan.md wave heading. */
const WAVE_HEADING = /^##\s+Wave\s+\d+/i

/** True when `lines` contains `heading` as a whole line (case-insensitive). */
function hasHeading(lines: string[], heading: string): boolean {
  const want = heading.toLowerCase()
  return lines.some(l => l.trim().toLowerCase() === want)
}

/** Lines between `heading` and the next same-or-higher-level `#`/`##` heading. */
function sectionLines(lines: string[], heading: string): string[] {
  const want = heading.toLowerCase()
  const start = lines.findIndex(l => l.trim().toLowerCase() === want)
  if (start < 0) return []
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("## ") || line.startsWith("# ")) break
    out.push(line)
  }
  return out
}

/** The first non-empty line after `heading`, or null when there is none. */
function firstValueAfter(lines: string[], heading: string): string | null {
  for (const line of sectionLines(lines, heading)) {
    if (line) return line
  }
  return null
}

/** One error per required heading that is absent. */
function missingHeadings(file: string, lines: string[], required: string[]): string[] {
  return required.filter(h => !hasHeading(lines, h)).map(h => `${file}: missing ${h}`)
}

/** Shorten a line so a single malformed step cannot flood the error list. */
function truncate(line: string): string {
  return line.length > MAX_FIELD_LENGTH ? line.slice(0, MAX_FIELD_LENGTH) + "…" : line
}

/**
 * `affect.md` — required headings plus the two content rules that make the
 * file usable by the parallel guard: a real affected-file list and a risk band.
 */
function validateAffect(lines: string[]): string[] {
  const errors = missingHeadings("affect.md", lines, [
    "## Affected Files",
    "## Risk Level",
    "## Parallel Safety",
  ])

  if (hasHeading(lines, "## Affected Files")) {
    const entries = sectionLines(lines, "## Affected Files")
    if (!entries.some(l => AFFECTED_FILE_LINE.test(l))) {
      errors.push(
        "affect.md: ## Affected Files must list at least one '- <path> (modify|create|delete)' entry",
      )
    }
  }

  if (hasHeading(lines, "## Risk Level")) {
    const risk = firstValueAfter(lines, "## Risk Level")
    if (risk === null || !RISK_LEVELS.has(risk.toLowerCase())) {
      errors.push("affect.md: ## Risk Level value must be low|medium|high")
    }
  }

  if (!hasHeading(lines, "### Can Parallel") && !hasHeading(lines, "### Must Sequential")) {
    errors.push("affect.md: must have ### Can Parallel or ### Must Sequential")
  }

  return errors
}

/**
 * `plan.md` — at least one wave with at least one step, and every step
 * carries both a requirement trace and an explicit file list.
 */
function validatePlan(lines: string[]): string[] {
  const errors: string[] = []
  let sawWave = false
  let inWave = false
  let sawStep = false

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith("#")) {
      inWave = WAVE_HEADING.test(line)
      if (inWave) sawWave = true
      continue
    }
    if (!line.startsWith("- [ ]")) continue
    if (inWave) sawStep = true
    if (!line.includes("traces: R-")) {
      errors.push(`plan.md: step missing 'traces: R-': ${truncate(line)}`)
    }
    if (!line.includes("files: [")) {
      errors.push(`plan.md: step missing 'files: [': ${truncate(line)}`)
    }
  }

  if (!sawWave) errors.push("plan.md: no '## Wave N' heading found")
  else if (!sawStep) errors.push("plan.md: no '- [ ]' step found under a '## Wave N' heading")

  return errors
}

/**
 * Format check for all four topic artifacts.
 *
 * Verifies required sections are present and that `affect.md` / `plan.md`
 * carry the machine-readable fields downstream commands depend on. Content
 * quality is not judged — only structure.
 *
 * Returns JSON `{ valid, errors }` so callers can branch without parsing prose.
 */
function validateArtifacts(directory: string, topic: string): string {
  const errors: string[] = []

  const files = [
    { name: "task.md", path: topicTaskPath(directory, topic) },
    { name: "architecture.md", path: topicArchitecturePath(directory, topic) },
    { name: "affect.md", path: topicAffectPath(directory, topic) },
    { name: "plan.md", path: topicPlanPath(directory, topic) },
  ]

  for (const { name, path } of files) {
    const r = readOrMissing(path)
    if (!r.exists) {
      errors.push(`${name}: file not found`)
      continue
    }
    const lines = r.content.split("\n")
    switch (name) {
      case "task.md":
        errors.push(
          ...missingHeadings(name, lines, [
            "## Requirements",
            "## Acceptance Criteria",
            "## Constraints",
          ]),
        )
        break
      case "architecture.md":
        errors.push(...missingHeadings(name, lines, ["## Approach", "## Components"]))
        break
      case "affect.md":
        errors.push(...validateAffect(lines))
        break
      case "plan.md":
        errors.push(...validatePlan(lines))
        break
    }
  }

  return JSON.stringify({ valid: errors.length === 0, errors })
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
    "Consistency checks for topic artifacts. action:artifacts verifies task/architecture/affect/plan have the required sections and returns JSON {valid, errors}. action:pre-execute confirms task/affect/plan are coherent before a worktree is created and returns OK or a list of errors.",
  args: {
    action: tool.schema.enum(["pre-execute", "artifacts"]),
    topic: tool.schema.string(),
  },
  async execute(args, context) {
    if (args.action === "artifacts") {
      return validateArtifacts(context.directory, args.topic)
    }
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
