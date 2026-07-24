import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { topicContextPath, readOrMissing, appendWithLock, clearFileWithLock } from "./planning-state-lib"

/** Cap a single appended summary to this many characters. Matches `capture-lesson.ts:6` `MAX_FIELD_LENGTH`. */
const MAX_FIELD_LENGTH = 2000

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 14) + "… [truncated]"
}

/**
 * Per-topic agent-output log: `~/.fd-plan/<project>/<topic>/context.md`.
 *
 * Each line: `[<ISO timestamp>] [<stage>/<agent>] <summary>`. Created on
 * first `append`. Reading or clearing a missing file is a no-op that
 * returns an explicit shape rather than an error — callers shouldn't
 * need to handle "first time" specially.
 */
export const fdxContextTool: ToolDefinition = tool({
  description:
    "Manage per-topic context log: append agent output, read recent entries, clear. " +
    "Call after each subagent task to record what it did. Reading or clearing a missing file is safe.",
  args: {
    action: tool.schema.enum(["append", "read", "clear"]),
    topic: tool.schema.string(),
    agent: tool.schema.string().optional(),
    stage: tool.schema.string().optional(),
    summary: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const path = topicContextPath(context.directory, args.topic)

    if (args.action === "append") {
      if (!args.agent || !args.stage || !args.summary) {
        return "Error: agent, stage, and summary are required for action=append"
      }
      const summary = truncate(args.summary, MAX_FIELD_LENGTH)
      const line = `[${new Date().toISOString()}] [${args.stage}/${args.agent}] ${summary}\n`
      try {
        appendWithLock(path, line)
        return `Appended context entry to ${path}`
      } catch (err) {
        return `Error: failed to append context entry: ${(err as Error).message}`
      }
    }

    if (args.action === "read") {
      const result = readOrMissing(path)
      if (!result.exists) return "(context.md does not exist yet)"
      return result.content
    }

    if (args.action === "clear") {
      const existed = readOrMissing(path).exists
      try {
        clearFileWithLock(path)
        return existed ? `Cleared ${path}` : `Clear: file did not exist (noop)`
      } catch (err) {
        return `Error: failed to clear context file: ${(err as Error).message}`
      }
    }

    return `Error: unknown action ${args.action as string}`
  },
})
