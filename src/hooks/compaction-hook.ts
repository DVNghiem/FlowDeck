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
 * Optimization: tracks summaryVersion of the last injected STATE.md and
 * CODEBASE_INDEX.md per session. When both versions are unchanged, injects
 * only a compact fingerprint instead of re-injecting full documents — reducing
 * token cost of each compaction cycle while always preserving a minimal anchor.
 *
 * Inspired by oh-my-openagent's compaction-context-injector and
 * ECC's experimental.session.compacting handler.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { SessionFileTracker } from "./file-tracker"
import { readCodebaseIndex } from "../tools/codebase-index"
import { statePath, parseState } from "../tools/planning-state-lib"

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

/**
 * Per-session tracking of what versions were last injected.
 * Prevents re-injecting full documents when state is unchanged.
 */
interface VersionSnapshot {
  stateVersion: number
  indexVersion: number
}

const _lastInjected = new Map<string, VersionSnapshot>()

function readPlanningState(directory: string): { content: string; version: number } | null {
  const sp = statePath(directory)
  if (!existsSync(sp)) return null
  try {
    const content = readFileSync(sp, "utf-8")
    const parsed = parseState(content)
    const version = typeof parsed.summaryVersion === "number" ? parsed.summaryVersion : 0
    // Extract first 1500 chars to avoid bloating compaction
    return { content: content.slice(0, 1500), version }
  } catch {
    return null
  }
}

export function createCompactionHook(
  ctx: { directory: string },
  tracker: SessionFileTracker,
) {
  return async (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => {
    const sections: string[] = ["# FlowDeck Context (preserve across compaction)", ""]

    // Read current summaryVersions
    const stateData = readPlanningState(ctx.directory)
    const indexData = readCodebaseIndex(ctx.directory)
    const currentStateVersion = stateData?.version ?? 0
    const currentIndexVersion = indexData.summaryVersion ?? 0

    const lastSnapshot = _lastInjected.get(input.sessionID)
    const stateChanged = !lastSnapshot || lastSnapshot.stateVersion !== currentStateVersion
    const indexChanged = !lastSnapshot || lastSnapshot.indexVersion !== currentIndexVersion

    if (stateChanged && stateData) {
      // Full injection — state has changed since last compaction
      sections.push("## Planning State")
      sections.push("```")
      sections.push(stateData.content.trim())
      sections.push("```")
      sections.push("")
    } else if (stateData) {
      // Compact fingerprint — unchanged since last compaction
      sections.push(`## Planning State (unchanged, v${currentStateVersion})`)
      sections.push(`_State unchanged since last compaction. summaryVersion=${currentStateVersion}_`)
      sections.push("")
    }

    // Read CODEBASE_INDEX.md
    const indexPath = join(ctx.directory, ".planning", "CODEBASE_INDEX.md")
    if (indexChanged && existsSync(indexPath)) {
      try {
        const indexContent = readFileSync(indexPath, "utf-8")
        const indexSummary = "\n## Codebase Index\n```\n" + indexContent.slice(0, 800) + "\n```\n"
        sections.push(indexSummary)
        sections.push("")
      } catch { /* ignore */ }
    } else if (existsSync(indexPath)) {
      sections.push(`## Codebase Index (unchanged, v${currentIndexVersion})`)
      sections.push(`_Index unchanged since last compaction. summaryVersion=${currentIndexVersion}_`)
      sections.push("")
    }

    // Update last-injected snapshot
    _lastInjected.set(input.sessionID, {
      stateVersion: currentStateVersion,
      indexVersion: currentIndexVersion,
    })

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

