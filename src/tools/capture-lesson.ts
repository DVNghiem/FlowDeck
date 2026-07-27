import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, statSync } from "fs"
import { basename, join } from "path"
import { homedir } from "os"

const LEGACY_LESSONS_FILE = ".flowdeck/lessons.md"
const DEFAULT_LESSONS_FILE = join(homedir(), ".fd-plan", "lessons.md")
const MAX_FIELD_LENGTH = 2000
const MAX_FILE_SIZE_BYTES = 100 * 1024

function lessonsFilePath(): string {
  return process.env.FLOWDECK_LESSONS_FILE ?? DEFAULT_LESSONS_FILE
}

function validateField(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${name} must be a non-empty string`
  }
  if (value.length > MAX_FIELD_LENGTH) {
    return `${name} exceeds maximum length of ${MAX_FIELD_LENGTH} characters`
  }
  return ""
}

function truncateLessonsFile(filePath: string): void {
  const content = readFileSync(filePath, "utf-8").trim()
  const sections = content.split(/\n(?=## )/).filter(Boolean)
  // Drop oldest sections until the file is under the size cap.
  let kept = sections
  while (kept.length > 1 && Buffer.byteLength(kept.join("\n\n").trim(), "utf-8") > MAX_FILE_SIZE_BYTES) {
    kept = kept.slice(1)
  }
  writeFileSync(filePath, kept.join("\n\n") + (kept.length > 0 ? "\n\n" : ""), "utf-8")
}

// One-shot migration: if the global lessons file is missing but a legacy
// per-project file exists at <cwd>/.flowdeck/lessons.md, copy it to the global
// path so historical lessons remain reachable. Tag every entry with the
// basename of the cwd as its project. Runs at most once per cwd: after the
// first successful copy, the global file exists and subsequent reads skip.
function migrateLegacyIfPresent(directory: string): void {
  const target = lessonsFilePath()
  if (existsSync(target)) return
  const legacy = join(directory, LEGACY_LESSONS_FILE)
  if (!existsSync(legacy)) return
  const project = basename(directory) || "(unknown)"
  const raw = readFileSync(legacy, "utf-8").trim()
  if (!raw) return
  const sections = raw.split(/\n(?=## )/).filter(Boolean)
  const tagged = sections
    .map(s => (/^\*\*Project:\*\*/m.test(s) ? s : s.replace(/(\*\*Severity:\*\*[^\n]*\n)/, `$1**Project:** ${project}\n`)))
    .join("\n\n")
  mkdirSync(join(target, ".."), { recursive: true })
  writeFileSync(target, tagged + "\n\n", "utf-8")
}

export const captureLessonTool: ToolDefinition = tool({
  description:
    "Record a reusable lesson learned from a failure or unexpected complexity. " +
    "Call after any significant failure or when the same mistake happens twice. " +
    "Lessons are injected at the start of future sessions.",
  args: {
    context: tool.schema.string(),
    mistake: tool.schema.string(),
    lesson: tool.schema.string(),
    severity: tool.schema.enum(["low", "medium", "high"]).optional().default("medium"),
  },
  async execute(args, context) {
    const validations = [
      validateField("context", args.context),
      validateField("mistake", args.mistake),
      validateField("lesson", args.lesson),
    ].filter(Boolean)
    if (validations.length > 0) {
      return `Error: ${validations.join("; ")}`
    }

    const filePath = lessonsFilePath()
    mkdirSync(join(filePath, ".."), { recursive: true })

    if (existsSync(filePath)) {
      const stats = statSync(filePath)
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        truncateLessonsFile(filePath)
      }
    }

    const project = basename(context.directory) || "(unknown)"
    const entry = [
      `## ${new Date().toISOString().slice(0, 10)} — ${args.context}`,
      `**Severity:** ${args.severity}`,
      `**Project:** ${project}`,
      `**Mistake:** ${args.mistake}`,
      `**Lesson:** ${args.lesson}`,
      "",
    ].join("\n")

    appendFileSync(filePath, entry)
    return `Lesson captured in ${filePath}`
  },
})

export const reviewLessonsTool: ToolDefinition = tool({
  description:
    "Read captured lessons relevant to the current task. " +
    "Call at the start of any complex or familiar-seeming task. " +
    "Without keywords, returns lessons tagged for the current project. " +
    "With keywords, searches across all projects.",
  args: {
    keywords: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args, context) {
    migrateLegacyIfPresent(context.directory)
    const path = lessonsFilePath()
    if (!existsSync(path)) return "No lessons captured yet."
    const content = readFileSync(path, "utf-8").trim()
    if (!content) return "No lessons yet."
    const sections = content.split(/\n(?=## )/).filter(Boolean)
    const useKeywords = (args.keywords?.length ?? 0) > 0
    if (!useKeywords) {
      const project = basename(context.directory) || "(unknown)"
      const scoped = sections.filter(s => {
        const m = /\*\*Project:\*\* ([^\n]+)/.exec(s)
        const tag = m ? m[1].trim() : "(unknown)"
        return tag === project
      })
      return scoped.length
        ? scoped.join("\n\n")
        : `No lessons captured yet for project "${project}".`
    }
    const hits = sections.filter(s =>
      (args.keywords ?? []).some(k => s.toLowerCase().includes(k.toLowerCase()))
    )
    return hits.length
      ? hits.join("\n\n")
      : `No lessons matching: ${(args.keywords ?? []).join(", ")}`
  },
})
