/**
 * Decision Trace Hook
 * Auto-records a concise decision entry whenever the agent applies a write or edit.
 * Writes to .codebase/DECISIONS.jsonl for fast human review.
 */

import { existsSync, mkdirSync, appendFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"

export async function decisionTraceHook(
  ctx: { directory: string },
  input: { tool: string },
  output: { args: any }
): Promise<void> {
  if (input.tool !== "write" && input.tool !== "edit") return
  const filePath: string = output.args?.filePath ?? output.args?.path ?? ""
  if (!filePath) return

  const base = codebaseDir(ctx.directory)

  try {
    if (!existsSync(base)) mkdirSync(base, { recursive: true })

    const entry = {
      timestamp: new Date().toISOString(),
      file_path: filePath,
      change_type: input.tool === "write" ? "create" : "edit",
      rationale: output.args?.rationale ?? "(not provided — use decision-trace tool for richer records)",
      evidence: [],
      assumptions: [],
      alternatives_considered: [],
      risk_level: "unknown",
      auto_recorded: true,
    }

    appendFileSync(
      join(base, "DECISIONS.jsonl"),
      JSON.stringify(entry) + "\n",
      "utf-8"
    )
  } catch {
    // Best-effort — never block the tool call due to a logging failure
  }
}
