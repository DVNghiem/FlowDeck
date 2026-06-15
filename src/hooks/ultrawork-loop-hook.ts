/**
 * UltraWork Loop Hook
 *
 * When FLOWDECK_ULTRAWORK=on, after session.idle fires for the primary session,
 * check if the workflow is complete (all PLAN.md steps done, STATE.md status = done).
 * If not complete and orchestrator stopped, re-prompt it to continue.
 */
import { readFileSync, existsSync } from "fs"
import { statePath } from "../tools/planning-state-lib"

export function createUltraworkLoopHook(
  client: { session: { prompt: (args: any) => Promise<any> } },
  getPrimarySessionId: () => string,
  directory: string,
) {
  if (process.env.FLOWDECK_ULTRAWORK !== "on") return null

  let lastPromptedAt = 0
  const DEDUPE_MS = 2000

  return async function onSessionIdle(sessionId: string) {
    if (sessionId !== getPrimarySessionId()) return

    const sp = statePath(directory)
    if (!existsSync(sp)) return

    const state = readFileSync(sp, "utf-8")
    const isDone = /status:\s*done|phase:\s*review|all steps complete/i.test(state)
    if (isDone) return

    const now = Date.now()
    if (now - lastPromptedAt < DEDUPE_MS) return
    lastPromptedAt = now

    // Re-prompt orchestrator to continue
    await client.session.prompt({
      path: { id: getPrimarySessionId() },
      body: {
        agent: "orchestrator",
        parts: [{ type: "text", text: "The workflow is not yet complete. Continue from where you left off. Check planning-state for remaining steps and proceed with the next stage." }],
      },
      query: { directory },
    })
  }
}
