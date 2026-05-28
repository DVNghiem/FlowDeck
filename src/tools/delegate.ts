import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { existsSync, readFileSync } from "fs"
import { recordRun } from "../services/agent-performance"
import { normalizeTaskType, shouldRetry } from "./dispatch-routing"
import { getCached, setCached, CACHEABLE_AGENTS } from "../services/prompt-cache"
import { readCodebaseIndex } from "./codebase-index"
import { statePath, parseState } from "./planning-state-lib"

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
      /**
       * When set AND the agent is in the read-only safe set (researcher, code-explorer,
       * reviewer, plan-checker, security-auditor, question-guard, quick-router),
       * the response is cached for this many milliseconds.
       *
       * The cache key includes: agent + prompt + context + STATE summaryVersion + index summaryVersion.
       * The cache is automatically invalidated when the state or codebase index changes.
       *
       * Only set this for truly idempotent read-only agents. Never set for coders,
       * testers, or any agent that produces side effects.
       */
      safe_to_cache: tool.schema.boolean().optional().default(false),
      cache_ttl_ms: tool.schema.number().optional(),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const taskType = normalizeTaskType(args.task_type, args.agent)
      const retryAttempts = typeof args.retry_attempts === "number" ? args.retry_attempts : 1
      const maxRetries = Math.max(0, Math.floor(retryAttempts))

      const fullPrompt = args.context
        ? `${args.context}\n\n---\n\n${args.prompt}`
        : args.prompt

      // Resolve summaryVersions for cache key (only when caching is requested)
      const safe_to_cache = args.safe_to_cache === true && CACHEABLE_AGENTS.has(args.agent)
      let stateVersion = 0
      let indexVersion = 0
      if (safe_to_cache) {
        const index = readCodebaseIndex(context.directory)
        const sp = statePath(context.directory)
        const rawState = existsSync(sp) ? readFileSync(sp, "utf-8") : ""
        const state = rawState ? parseState(rawState) : {}
        stateVersion = typeof state.summaryVersion === "number" ? state.summaryVersion : 0
        indexVersion = typeof index.summaryVersion === "number" ? index.summaryVersion : 0

        const cached = getCached(context.directory, args.agent, fullPrompt, args.context ?? "", stateVersion, indexVersion, true)
        if (cached !== null) {
          return JSON.stringify({
            agent: args.agent,
            success: true,
            output: cached,
            task_type: taskType,
            model: "",
            retries_used: 0,
            duration_ms: Date.now() - startTime,
            cached: true,
          })
        }
      }

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

      const fullPromptForSession = args.context
        ? `${args.context}\n\n---\n\n${args.prompt}`
        : args.prompt

      let promptRes: any = null
      let retriesUsed = 0
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        promptRes = await client.session.prompt({
          path: { id: childId },
          body: {
            agent: args.agent,
            parts: [{ type: "text", text: fullPromptForSession }],
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
          "",
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
          model: "",
          retries_used: retriesUsed,
          duration_ms: Date.now() - startTime,
        })
      }

      const info = promptRes.data?.info
      if (info?.error) {
        recordRun(
          context.directory,
          args.agent,
          "",
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
          model: "",
          retries_used: retriesUsed,
          duration_ms: Date.now() - startTime,
        })
      }

      const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)
      recordRun(
        context.directory,
        args.agent,
        "",
        taskType,
        true,
        Date.now() - startTime,
      )

      // Store in cache if safe_to_cache was set
      if (safe_to_cache && output) {
        setCached(
          context.directory,
          args.agent,
          fullPromptForSession,
          args.context ?? "",
          stateVersion,
          indexVersion,
          output,
          true,
          args.cache_ttl_ms,
        )
      }

      return JSON.stringify({
        agent: args.agent,
        session_id: childId,
        success: true,
        output: output || "(no text output)",
        task_type: taskType,
        model: "",
        retries_used: retriesUsed,
        duration_ms: Date.now() - startTime,
      })
    },
  })
}
