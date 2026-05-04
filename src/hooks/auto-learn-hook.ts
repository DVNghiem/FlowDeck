/**
 * Auto-Learn Hook
 *
 * Fires automatically on session.idle after significant work has been done.
 * Spawns a background child session with the @auto-learner agent, which:
 *   1. Calls the `reflect` tool to analyse session artifacts
 *   2. Calls `create-skill` for any valuable patterns found
 *
 * No user command required — fully automatic.
 *
 * Safeguards:
 * - Only triggers once per plugin session (triggered flag)
 * - Requires at least MIN_EDITS file edits to consider work "significant"
 * - Fire-and-forget: does not block the user's session
 * - All errors are swallowed — never surfaces to the user
 */

import type { OpencodeClient } from "@opencode-ai/sdk"
import type { SessionFileTracker } from "./file-tracker"

const MIN_EDITS = 1

export function createAutoLearnHook(
  client: OpencodeClient,
  fileTracker: SessionFileTracker,
  directory: string,
  appLog: (msg: string) => void,
) {
  let triggered = false

  return async () => {
    if (triggered) return

    const edited = fileTracker.getEditedPaths()
    if (edited.length < MIN_EDITS) return

    // Mark triggered immediately — don't attempt twice even if this call fails
    triggered = true

    // Fire-and-forget: kick off the child session in the background
    void runAutoLearner(client, directory, appLog).catch(() => {
      // Silently discard — auto-learn is best-effort
    })
  }
}

async function runAutoLearner(
  client: OpencodeClient,
  directory: string,
  appLog: (msg: string) => void,
): Promise<void> {
  const createRes = await client.session.create({
    body: { title: "auto-learn" },
    query: { directory },
  })

  if (createRes.error || !createRes.data?.id) return

  const childId = createRes.data.id
  appLog("[FlowDeck] Auto-learn: analysing session for new skills...")

  const promptRes = await client.session.prompt({
    path: { id: childId },
    body: {
      agent: "auto-learner",
      parts: [
        {
          type: "text",
          text:
            "Run your automated self-improvement routine: call `reflect`, " +
            "identify patterns, and call `create-skill` for each one. " +
            "Complete silently without asking for input.",
        },
      ],
      tools: { question: false },
    },
    query: { directory },
  })

  if (promptRes.error) return

  // Extract and log the summary line
  const parts = (promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>
  const output = parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text as string)
    .join("\n")
    .trim()

  if (output) {
    // Only log the last line (the summary) to avoid noise
    const lastLine = output.split("\n").filter(Boolean).at(-1) ?? output
    appLog(`[FlowDeck] Auto-learn: ${lastLine}`)
  }
}
