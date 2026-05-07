import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { recordRun } from "../services/agent-performance"
import { routeModel } from "../services/model-router"
import { normalizeTaskType, shouldRetry } from "./dispatch-routing"

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

export function createDelegateTool(client: OpencodeClient): ToolDefinition {
  return tool({
    description: "Delegate a task to a single agent via a child session. Returns the agent's output.",
    args: {
      agent: tool.schema.string(),
      prompt: tool.schema.string(),
      context: tool.schema.string().optional(),
      task_type: tool.schema.string().optional(),
      retry_attempts: tool.schema.number().optional().default(1),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const taskType = normalizeTaskType(args.task_type, args.agent)
      const routing = routeModel(context.directory, taskType)
      const retryAttempts = typeof args.retry_attempts === "number" ? args.retry_attempts : 1
      const maxRetries = Math.max(0, Math.floor(retryAttempts))

      const createRes = await client.session.create({
        body: { parentID: context.sessionID, title: `${args.agent}-delegate` },
        query: { directory: context.directory },
      })

      if (createRes.error || !createRes.data?.id) {
        return JSON.stringify({
          agent: args.agent,
          success: false,
          error: `Failed to create session: ${(createRes.error as any)?.detail ?? "unknown"}`,
          duration_ms: Date.now() - startTime,
        })
      }

      const childId = createRes.data.id

      // Abort child if parent is cancelled
      context.abort.addEventListener("abort", () => {
        client.session.abort({
          path: { id: childId },
          query: { directory: context.directory },
        }).catch(() => {/* best-effort */})
      })

      const fullPrompt = args.context
        ? `${args.context}\n\n---\n\n${args.prompt}`
        : args.prompt

      let promptRes: any = null
      let retriesUsed = 0
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        promptRes = await client.session.prompt({
          path: { id: childId },
          body: {
            agent: args.agent,
            model: routing.model as any,
            parts: [{ type: "text", text: fullPrompt }],
            tools: { question: false },
          } as any,
          query: { directory: context.directory },
        })
        if (!shouldRetry(promptRes) || attempt === maxRetries) break
        retriesUsed++
      }

      if (!promptRes || promptRes.error) {
        recordRun(
          context.directory,
          args.agent,
          routing.model,
          taskType,
          false,
          Date.now() - startTime,
        )
        return JSON.stringify({
          agent: args.agent,
          session_id: childId,
          success: false,
          error: `Prompt failed: ${(promptRes?.error as any)?.detail ?? "unknown"}`,
          task_type: taskType,
          model: routing.model,
          retries_used: retriesUsed,
          duration_ms: Date.now() - startTime,
        })
      }

      const info = promptRes.data?.info
      if (info?.error) {
        recordRun(
          context.directory,
          args.agent,
          routing.model,
          taskType,
          false,
          Date.now() - startTime,
        )
        return JSON.stringify({
          agent: args.agent,
          session_id: childId,
          success: false,
          error: `Agent error: ${JSON.stringify(info.error)}`,
          task_type: taskType,
          model: routing.model,
          retries_used: retriesUsed,
          duration_ms: Date.now() - startTime,
        })
      }

      const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)
      recordRun(
        context.directory,
        args.agent,
        routing.model,
        taskType,
        true,
        Date.now() - startTime,
      )

      return JSON.stringify({
        agent: args.agent,
        session_id: childId,
        success: true,
        output: output || "(no text output)",
        task_type: taskType,
        model: routing.model,
        retries_used: retriesUsed,
        duration_ms: Date.now() - startTime,
      })
    },
  })
}
