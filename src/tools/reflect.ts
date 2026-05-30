import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

// Maximum bytes to read from any single artifact to avoid context exhaustion
const MAX_ARTIFACT_BYTES = 4_000

function tail(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text
  return "... (truncated) ...\n" + text.slice(-maxBytes)
}

export const reflectTool: ToolDefinition = tool({
  description:
    "Gather session artifacts (decisions, telemetry, failures, policies) and return a structured " +
    "reflection context that the agent can reason over to produce self-improvement proposals.",
  args: {
    scope: tool.schema
      .enum(["session", "project"])
      .optional()
      .describe("'session' (default) uses only recent artifacts; 'project' includes all historical data"),
  },
  async execute(args, context): Promise<string> {
    const root = context.directory
    const scope = args.scope ?? "session"

    const ARTIFACT_PATHS: Array<[string, string]> = [
      [".codebase/DECISIONS.jsonl", "Decisions"],
      [".codebase/TELEMETRY.jsonl", "Tool Usage"],
      [".codebase/FAILURES.json", "Failures"],
      [".codebase/POLICIES.json", "Active Policies"],
    ]

    const sections: string[] = [
      `# FlowDeck Reflection Context`,
      `Scope: ${scope} | Directory: ${root}`,
      "",
    ]

    let found = 0
    for (const [rel, label] of ARTIFACT_PATHS) {
      const full = join(root, rel)
      if (!existsSync(full)) continue
      try {
        const raw = readFileSync(full, "utf-8").trim()
        if (!raw) continue
        const count = raw.split("\n").filter(Boolean).length
        sections.push(`## ${label} (${count} entries)`, "```", tail(raw, MAX_ARTIFACT_BYTES), "```", "")
        found++
      } catch {
        // skip unreadable files
      }
    }

    if (found === 0) {
      return (
        "No FlowDeck artifacts found under .codebase/.\n" +
        "Run some tasks first so decisions, telemetry, and failures are recorded."
      )
    }

    sections.push(
      "## What to do with this data",
      "Analyse the artifacts above and:",
      "1. **Identify patterns** — repeated tool sequences, recurring failure modes",
      "2. **Surface gaps** — knowledge or skills that were missing and had to be figured out",
      "3. **Propose improvements** — for each gap or pattern, either:",
      "   - Write a new skill markdown file under `src/skills/<name>/SKILL.md`, OR",
      "   - Propose a new entry in `.codebase/POLICIES.json`",
      "4. **Summarise** — 3–5 bullet points of the most impactful takeaways",
    )

    return sections.join("\n")
  },
})
