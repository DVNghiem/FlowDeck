/**
 * Compaction Hook
 * Fires on `experimental.session.compacting` to inject structured context
 * so the LLM summarization preserves FlowDeck's planning state and recent work.
 *
 * Context includes:
 * 1. FlowDeck planning state (phase, status, pending steps)
 * 2. Recently edited files (from SessionFileTracker)
 * 3. Structured 8-section summary prompt
 *
 * Inspired by oh-my-openagent's compaction-context-injector and
 * ECC's experimental.session.compacting handler.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { SessionFileTracker } from "./file-tracker"

const STRUCTURED_SUMMARY_PROMPT = `
When summarizing this session, you MUST include the following sections:

## 1. User Requests (verbatim)
List all original user requests exactly as stated.

## 2. Final Goal
What the user ultimately wants to achieve.

## 3. Work Completed
- Files created / modified
- Features implemented
- Problems solved

## 4. Remaining Tasks
- What still needs to be done
- Pending items from the original request

## 5. Active Working Context
- Files currently being edited or frequently referenced
- Key code snippets or function signatures under active development
- External references (docs, APIs) being consulted

## 6. Explicit Constraints (verbatim only)
Quote constraints stated by the user or in AGENTS.md. Do NOT invent constraints.
If none exist, write "None".

## 7. Verification State
- What has been tested / validated
- What still needs verification
- Any test failures or blockers

## 8. Delegated Agent Sessions
List all background agent tasks spawned this session.
For each: agent name, status, description, session_id.
**RESUME, DON'T RESTART.** Use session_id to continue existing sessions.
`

function readPlanningState(directory: string): string | null {
  const statePath = join(directory, ".planning", "STATE.md")
  if (!existsSync(statePath)) return null
  try {
    const content = readFileSync(statePath, "utf-8")
    // Extract only the first 1500 chars to avoid bloating compaction
    return content.slice(0, 1500)
  } catch {
    return null
  }
}

export function createCompactionHook(
  ctx: { directory: string },
  tracker: SessionFileTracker,
) {
  return async (
    _input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => {
    const sections: string[] = ["# FlowDeck Context (preserve across compaction)", ""]

    // Planning state
    const state = readPlanningState(ctx.directory)
    if (state) {
      sections.push("## Planning State")
      sections.push("```")
      sections.push(state.trim())
      sections.push("```")
      sections.push("")
    }

    // Read CODEBASE_INDEX.md
    const indexPath = join(ctx.directory, ".planning", "CODEBASE_INDEX.md")
    let indexSummary = ""
    if (existsSync(indexPath)) {
      try {
        const indexContent = readFileSync(indexPath, "utf-8")
        // Extract first 800 chars to avoid bloating
        indexSummary = "\n## Codebase Index\n```\n" + indexContent.slice(0, 800) + "\n```\n"
      } catch { /* ignore */ }
    }

    if (indexSummary) {
      sections.push(indexSummary)
      sections.push("")
    }

    // Recently edited files
    const edited = tracker.getEditedPaths()
    if (edited.length > 0) {
      sections.push("## Recently Edited Files")
      for (const f of edited.slice(0, 20)) {
        sections.push(`- ${f}`)
      }
      if (edited.length > 20) sections.push(`- … and ${edited.length - 20} more`)
      sections.push("")
    }

    output.context.push(sections.join("\n"))

    // Inject structured summary prompt — replaces the default
    output.prompt = STRUCTURED_SUMMARY_PROMPT.trim()
  }
}
