import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { topicDecisionsPath, readOrMissing, appendWithLock } from "./planning-state-lib"

/** Cap a single decision/rationale field. Matches `capture-lesson.ts:6` `MAX_FIELD_LENGTH`. */
const MAX_FIELD_LENGTH = 2000

/** Strip control characters that would break the markdown block structure. */
function sanitize(text: string): string {
  // Drop CR/LF and NUL — each `## ...` block must stay single-line.
  return text.replace(/[\r\n\0]/g, " ").slice(0, MAX_FIELD_LENGTH)
}

/**
 * Per-topic design-decision log: `~/.fd-plan/<project>/<topic>/decisions.md`.
 *
 * Each entry is a markdown block:
 *
 *     ## <decision>
 *     - **Rationale:** <rationale>
 *     - **Made by:** <made_by | "orchestrator">
 *     - **At:** <ISO 8601 UTC>
 *
 * For runtime-captured lessons (mistakes, debugging insights), prefer
 * `capture-lesson` instead — this tool is for design decisions with
 * rationale and ownership. Reading a missing file returns the same
 * "doesn't exist" shape as `fdx-context` so callers don't have to
 * special-case the first write.
 */
export const fdxDecisionsTool: ToolDefinition = tool({
  description:
    "Record and read architectural/design decisions for a topic. " +
    "For runtime-captured lessons (mistakes, debugging insights), prefer `capture-lesson` — this tool is for design decisions with rationale and ownership.",
  args: {
    action: tool.schema.enum(["record", "read"]),
    topic: tool.schema.string(),
    decision: tool.schema.string().optional(),
    rationale: tool.schema.string().optional(),
    made_by: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const path = topicDecisionsPath(context.directory, args.topic)

    if (args.action === "record") {
      if (!args.decision || !args.rationale) {
        return "Error: decision and rationale are required for action=record"
      }
      const decision = sanitize(args.decision)
      const rationale = sanitize(args.rationale)
      const madeBy = sanitize(args.made_by ?? "orchestrator")
      const block = [
        `## ${decision}`,
        `- **Rationale:** ${rationale}`,
        `- **Made by:** ${madeBy}`,
        `- **At:** ${new Date().toISOString()}`,
        "",
        "",
      ].join("\n")
      try {
        appendWithLock(path, block)
        return `Recorded decision to ${path}`
      } catch (err) {
        return `Error: failed to record decision: ${(err as Error).message}`
      }
    }

    if (args.action === "read") {
      const result = readOrMissing(path)
      if (!result.exists) return "(decisions.md does not exist yet)"
      return result.content
    }

    return `Error: unknown action ${args.action as string}`
  },
})
