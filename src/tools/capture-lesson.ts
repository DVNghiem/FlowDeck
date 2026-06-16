import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, statSync } from "fs"
import { join } from "path"

const LESSONS_FILE = ".flowdeck/lessons.md"
const MAX_FIELD_LENGTH = 2000
const MAX_FILE_SIZE_BYTES = 100 * 1024

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

    const dir = join(context.directory, ".flowdeck")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const filePath = join(context.directory, LESSONS_FILE)
    if (existsSync(filePath)) {
      const stats = statSync(filePath)
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        truncateLessonsFile(filePath)
      }
    }

    const entry = [
      `## ${new Date().toISOString().slice(0, 10)} — ${args.context}`,
      `**Severity:** ${args.severity}`,
      `**Mistake:** ${args.mistake}`,
      `**Lesson:** ${args.lesson}`,
      "",
    ].join("\n")

    appendFileSync(filePath, entry)
    return `Lesson captured in ${LESSONS_FILE}`
  },
})

export const reviewLessonsTool: ToolDefinition = tool({
  description:
    "Read captured lessons relevant to the current task. " +
    "Call at the start of any complex or familiar-seeming task.",
  args: {
    keywords: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args, context) {
    const path = join(context.directory, LESSONS_FILE)
    if (!existsSync(path)) return "No lessons captured yet."
    const content = readFileSync(path, "utf-8").trim()
    if (!args.keywords?.length) return content || "No lessons yet."
    const sections = content.split(/\n(?=## )/).filter(Boolean)
    const hits = sections.filter(s =>
      args.keywords!.some(k => s.toLowerCase().includes(k.toLowerCase()))
    )
    return hits.length
      ? hits.join("\n\n")
      : `No lessons matching: ${args.keywords.join(", ")}`
  },
})
