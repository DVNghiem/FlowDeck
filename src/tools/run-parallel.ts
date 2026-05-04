import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { appendEvent } from "../services/telemetry"
import { codebaseDir } from "./planning-state-lib"
import { writeFileSync } from "fs"
import { join } from "path"

interface ParallelResult {
  agent: string
  session_id?: string
  success: boolean
  output?: string
  error?: string
  duration_ms: number
}

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

export function createRunParallelTool(client: OpencodeClient): ToolDefinition {
  return tool({
    description: "Run multiple agents in parallel. All tasks execute simultaneously via child sessions. Returns combined results with per-agent wall time. Partial results returned on failure.",
    args: {
      tasks: tool.schema.array(tool.schema.object({
        agent: tool.schema.string(),
        prompt: tool.schema.string(),
        context: tool.schema.string().optional(),
      })),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const childSessionIds: string[] = []

      // Abort all child sessions when parent is cancelled
      context.abort.addEventListener("abort", () => {
        for (const id of childSessionIds) {
          client.session.abort({
            path: { id },
            query: { directory: context.directory },
          }).catch(() => {/* best-effort */})
        }
      })

      const dir = context.directory ?? process.cwd()

      const promises = args.tasks.map(async (task): Promise<ParallelResult> => {
        const taskStart = Date.now()

        // Create a child session scoped to this task
        const createRes = await client.session.create({
          body: { parentID: context.sessionID, title: `${task.agent}-subtask` },
          query: { directory: context.directory },
        })

        if (createRes.error || !createRes.data?.id) {
          return {
            agent: task.agent,
            success: false,
            error: `Failed to create session: ${(createRes.error as any)?.detail ?? "unknown"}`,
            duration_ms: Date.now() - taskStart,
          }
        }

        const childId = createRes.data.id
        childSessionIds.push(childId)

        // Emit agent.dispatch telemetry
        appendEvent(dir, {
          session_id: context.sessionID,
          run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
          event: "agent.dispatch",
          agent: task.agent,
          status: "ok",
          meta: { child_session_id: childId, task_index: args.tasks.findIndex(t => t.agent === task.agent) },
        })

        const fullPrompt = task.context
          ? `${task.context}\n\n---\n\n${task.prompt}`
          : task.prompt

        const promptRes = await client.session.prompt({
          path: { id: childId },
          body: {
            agent: task.agent,
            parts: [{ type: "text", text: fullPrompt }],
            tools: { question: false },
          },
          query: { directory: context.directory },
        })

        // Surface both transport-level and agent-level errors
        if (promptRes.error) {
          appendEvent(dir, {
            session_id: context.sessionID,
            run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
            event: "agent.complete",
            agent: task.agent,
            status: "error",
            duration_ms: Date.now() - taskStart,
            meta: { child_session_id: childId, error: `Prompt failed: ${(promptRes.error as any)?.detail ?? "unknown"}` },
          })
          return {
            agent: task.agent,
            session_id: childId,
            success: false,
            error: `Prompt failed: ${(promptRes.error as any)?.detail ?? "unknown"}`,
            duration_ms: Date.now() - taskStart,
          }
        }

        const info = promptRes.data?.info
        if (info?.error) {
          appendEvent(dir, {
            session_id: context.sessionID,
            run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
            event: "agent.complete",
            agent: task.agent,
            status: "error",
            duration_ms: Date.now() - taskStart,
            meta: { child_session_id: childId, error: JSON.stringify(info.error) },
          })
          return {
            agent: task.agent,
            session_id: childId,
            success: false,
            error: `Agent error: ${JSON.stringify(info.error)}`,
            duration_ms: Date.now() - taskStart,
          }
        }

        const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)

        // Emit agent.complete telemetry
        appendEvent(dir, {
          session_id: context.sessionID,
          run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
          event: "agent.complete",
          agent: task.agent,
          status: "ok",
          duration_ms: Date.now() - taskStart,
          meta: { child_session_id: childId, output_length: output?.length ?? 0 },
        })

        return {
          agent: task.agent,
          session_id: childId,
          success: true,
          output: output || "(no text output)",
          duration_ms: Date.now() - taskStart,
        }
      })

      const settled = await Promise.allSettled(promises)
      const results: ParallelResult[] = settled.map((result, i) => {
        if (result.status === "fulfilled") return result.value
        return {
          agent: args.tasks[i].agent,
          success: false,
          error: result.reason?.message || String(result.reason),
          duration_ms: Date.now() - startTime,
        }
      })

      // Write progress file for real-time monitoring
      const progress = {
        total: args.tasks.length,
        completed: results.filter(r => r.success || r.error).length,
        in_progress: childSessionIds.length,
        results: results.map(r => ({ agent: r.agent, success: r.success, duration_ms: r.duration_ms })),
        total_duration_ms: Date.now() - startTime,
      }
      writeFileSync(join(codebaseDir(dir), "parallel-progress.json"), JSON.stringify(progress, null, 2))

      return JSON.stringify({
        results,
        total_duration_ms: Date.now() - startTime,
        failures: results.filter(r => !r.success).map(r => r.agent),
      })
    },
  })
}
