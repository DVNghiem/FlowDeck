import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { existsSync, readFileSync } from "fs"
import { recordRun } from "../services/agent-performance"
import { normalizeTaskType, shouldRetry } from "./dispatch-routing"
import { getCached, setCached, CACHEABLE_AGENTS } from "../services/prompt-cache"
import { readCodebaseIndex } from "./codebase-index"
import { statePath, parseState } from "./planning-state-lib"
import { recordModelCall, recordCacheHit, recordRetryCall, estimateTokens } from "../services/token-metrics"
import type { WorkflowStage } from "../services/token-metrics"
import { loadFlowDeckConfig } from "../config"
import { estimateCostUSD } from "../services/cost-estimator"

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

/**
 * Subscribe to the global SSE event stream and drive a child session to completion,
 * forwarding progress to the parent TUI via context.metadata({ title }).
 *
 * Strategy:
 *  1. Open SSE stream BEFORE sending the prompt so we never miss an early event.
 *  2. Fire promptAsync (returns immediately, 204).
 *  3. Consume events, filtering to childId, until `session.idle` arrives or abort fires.
 *  4. Fetch final messages from the child session and return the text output.
 */
async function runWithStreaming(
  client: OpencodeClient,
  childId: string,
  agentName: string,
  fullPrompt: string,
  toolsConfig: Record<string, boolean>,
  directory: string,
  abort: AbortSignal,
  onTitle: (title: string) => void,
): Promise<{ output: string; error?: string }> {
  // 1. Open the global SSE stream before sending prompt
  const sseResult = await client.event.subscribe({ query: { directory } })
  const stream = sseResult.stream

  // 2. Fire-and-return prompt (non-blocking)
  const asyncRes = await client.session.promptAsync({
    path: { id: childId },
    query: { directory },
    body: {
      agent: agentName,
      tools: toolsConfig,
      parts: [{ type: "text", text: fullPrompt }],
    },
  } as any)

  if ((asyncRes as any).error) {
    return {
      output: "",
      error: `promptAsync failed: ${JSON.stringify((asyncRes as any).error)}`,
    }
  }

  // Track streaming text for final output fallback
  let streamedText = ""
  let currentTool = ""

  onTitle(`⏳ ${agentName} — starting…`)

  // 3. Consume SSE events until session goes idle or abort fires
  try {
    for await (const raw of stream) {
      if (abort.aborted) break

      // SDK wraps in { [statusCode]: event } — unwrap
      const event: any = typeof raw === "object" && raw !== null
        ? (Object.values(raw)[0] ?? raw)
        : raw

      if (!event || typeof event !== "object") continue

      // Only process events belonging to our child session
      const sid: string | undefined = event.properties?.sessionID
      if (sid && sid !== childId) continue

      switch (event.type as string) {
        // Agent started a new reasoning step
        case "session.next.step.started": {
          const model: string = event.properties?.model?.id ?? ""
          onTitle(`🤔 ${agentName} — thinking${model ? ` (${model})` : ""}…`)
          break
        }

        // Streaming text delta — accumulate and show first 80 chars as preview
        case "session.next.text.delta": {
          const delta: string = event.properties?.delta ?? ""
          streamedText += delta
          const preview = streamedText.slice(-80).replace(/\n/g, " ").trim()
          onTitle(`✍️  ${agentName} — ${preview}`)
          break
        }

        // Full text block finished
        case "session.next.text.ended": {
          const text: string = event.properties?.text ?? streamedText
          streamedText = text
          break
        }

        // Reasoning delta (extended thinking models)
        case "session.next.reasoning.delta": {
          const delta: string = event.properties?.delta ?? ""
          const preview = delta.slice(0, 60).replace(/\n/g, " ").trim()
          onTitle(`💭 ${agentName} — ${preview}`)
          break
        }

        // A tool was called by the child agent
        case "session.next.tool.called": {
          currentTool = event.properties?.tool ?? "tool"
          onTitle(`🔧 ${agentName} → ${currentTool}…`)
          break
        }

        // Tool is sending progress updates
        case "session.next.tool.progress": {
          const content: Array<{ type: string; text?: string }> =
            event.properties?.content ?? []
          const progressText = content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text as string)
            .join(" ")
            .slice(0, 80)
            .replace(/\n/g, " ")
            .trim()
          if (progressText) {
            onTitle(`🔧 ${agentName} → ${currentTool}: ${progressText}`)
          }
          break
        }

        // Tool succeeded
        case "session.next.tool.success": {
          onTitle(`✅ ${agentName} → ${currentTool} done`)
          currentTool = ""
          break
        }

        // Tool failed
        case "session.next.tool.failed": {
          onTitle(`❌ ${agentName} → ${currentTool} failed`)
          currentTool = ""
          break
        }

        // Agent retried after an error
        case "session.next.retried": {
          onTitle(`↻ ${agentName} — retrying…`)
          break
        }

        // Step ended — show token cost if available
        case "session.next.step.ended": {
          const cost: number = event.properties?.cost ?? 0
          const finish: string = event.properties?.finish ?? ""
          if (cost > 0) {
            onTitle(`📊 ${agentName} — step done ($${cost.toFixed(4)}) [${finish}]`)
          } else {
            onTitle(`📊 ${agentName} — step done [${finish}]`)
          }
          break
        }

        // Session error
        case "session.error": {
          const msg: string =
            event.properties?.error?.message ?? JSON.stringify(event.properties?.error)
          return { output: streamedText, error: `Session error: ${msg}` }
        }

        // Session is now idle — we are done
        case "session.idle": {
          onTitle(`✓ ${agentName} — complete`)
          // Break out of the async generator loop
          goto_done: break goto_done
        }
      }

      // labeled-break workaround (TypeScript doesn't allow break inside switch
      // to exit for-await; use a flag instead)
      if (event.type === "session.idle") break
    }
  } catch (err: any) {
    // SSE stream closed or network error — not fatal, we still try to read output
    if (!abort.aborted) {
      onTitle(`⚠️  ${agentName} — stream closed (${err?.message ?? err})`)
    }
  }

  // 4. If streaming gave us enough text, return it directly
  if (streamedText) {
    return { output: streamedText }
  }

  // 5. Fallback: fetch final messages from child session
  try {
    const msgsRes = await client.session.messages({
      path: { id: childId },
      query: { directory },
    } as any)
    const messages: any[] = (msgsRes as any).data ?? []
    // Last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === "assistant") {
        const text = extractText(msg.parts ?? [])
        if (text) return { output: text }
      }
    }
  } catch {
    // ignore, return empty
  }

  return { output: "" }
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
      /**
       * Optional workflow identifier for cost/token metrics tracking.
       * When provided, each model call is recorded to TOKEN_METRICS.jsonl.
       */
      workflow_id: tool.schema.string().optional(),
      /**
       * Optional workflow stage for cost/token metrics tracking.
       * Defaults to "delegate" when workflow_id is set but stage is omitted.
       */
      stage: tool.schema.string().optional(),
    },
    async execute(args, execContext): Promise<string> {
      const startTime = Date.now()
      const taskType = normalizeTaskType(args.task_type, args.agent)
      const retryAttempts = typeof args.retry_attempts === "number" ? args.retry_attempts : 1
      const maxRetries = Math.max(0, Math.floor(retryAttempts))

      // Resolve configured model for this agent (for cost metrics)
      let agentModel = ""
      try {
        const cfg = loadFlowDeckConfig(execContext.directory)
        agentModel = cfg.agents?.[args.agent]?.model ?? ""
      } catch { /* non-fatal */ }

      const metricsWorkflowId = args.workflow_id ?? ""
      const metricsStage = (args.stage ?? "delegate") as WorkflowStage

      const fullPrompt = args.context
        ? `${args.context}\n\n---\n\n${args.prompt}`
        : args.prompt

      // ── Cache check ────────────────────────────────────────────────────────
      const safe_to_cache = args.safe_to_cache === true && CACHEABLE_AGENTS.has(args.agent)
      let stateVersion = 0
      let indexVersion = 0
      if (safe_to_cache) {
        const index = readCodebaseIndex(execContext.directory)
        const sp = statePath(execContext.directory)
        const rawState = existsSync(sp) ? readFileSync(sp, "utf-8") : ""
        const state = rawState ? parseState(rawState) : {}
        stateVersion = typeof state.summaryVersion === "number" ? state.summaryVersion : 0
        indexVersion = typeof index.summaryVersion === "number" ? index.summaryVersion : 0

        const cached = getCached(
          execContext.directory, args.agent, fullPrompt,
          args.context ?? "", stateVersion, indexVersion, true,
        )
        if (cached !== null) {
          if (metricsWorkflowId) {
            recordCacheHit(execContext.directory, metricsWorkflowId, metricsStage, fullPrompt, args.agent, agentModel)
          }
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

      // ── Create child session ───────────────────────────────────────────────
      const createRes = await client.session.create({
        body: { parentID: execContext.sessionID, title: `${args.agent}-delegate` },
        query: { directory: execContext.directory },
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
      execContext.abort.addEventListener("abort", () => {
        client.session.abort({
          path: { id: childId },
          query: { directory: execContext.directory },
        }).catch(() => {/* best-effort */})
      })

      // ── Retry loop with SSE streaming ──────────────────────────────────────
      let lastOutput = ""
      let lastError: string | undefined
      let retriesUsed = 0

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const attemptStart = Date.now()

        if (attempt > 0) {
          execContext.metadata({ title: `↻ ${args.agent} — retry ${attempt}/${maxRetries}…` })
        }

        const result = await runWithStreaming(
          client,
          childId,
          args.agent,
          fullPrompt,
          { question: false },
          execContext.directory,
          execContext.abort,
          (title) => execContext.metadata({ title }),
        )

        lastOutput = result.output
        lastError = result.error

        // Determine if we should retry: treat empty output or explicit error as retryable
        const shouldRetryAttempt = !!(lastError || !lastOutput.trim())

        if (!shouldRetryAttempt || attempt === maxRetries) break

        if (metricsWorkflowId) {
          const retryInputTokens = estimateTokens(fullPrompt)
          const retryCostUsd = agentModel ? estimateCostUSD(agentModel, retryInputTokens, 0) : undefined
          recordRetryCall(
            execContext.directory,
            metricsWorkflowId,
            metricsStage,
            fullPrompt,
            "",
            args.agent,
            Date.now() - attemptStart,
            agentModel,
            retryCostUsd,
          )
        }
        retriesUsed++
      }

      // ── Handle failure ─────────────────────────────────────────────────────
      if (lastError && !lastOutput.trim()) {
        recordRun(execContext.directory, args.agent, "", taskType, false, Date.now() - startTime)
        return JSON.stringify({
          agent: args.agent,
          session_id: childId,
          success: false,
          error: lastError,
          task_type: taskType,
          model: "",
          retries_used: retriesUsed,
          duration_ms: Date.now() - startTime,
        })
      }

      // ── Success ────────────────────────────────────────────────────────────
      recordRun(execContext.directory, args.agent, "", taskType, true, Date.now() - startTime)

      if (metricsWorkflowId) {
        const inputTokens = estimateTokens(fullPrompt)
        const outputTokens = estimateTokens(lastOutput)
        const costUsd = agentModel ? estimateCostUSD(agentModel, inputTokens, outputTokens) : undefined
        recordModelCall(
          execContext.directory,
          metricsWorkflowId,
          metricsStage,
          fullPrompt,
          lastOutput,
          args.agent,
          Date.now() - startTime,
          agentModel,
          costUsd,
        )
      }

      if (safe_to_cache && lastOutput) {
        setCached(
          execContext.directory,
          args.agent,
          fullPrompt,
          args.context ?? "",
          stateVersion,
          indexVersion,
          lastOutput,
          true,
          args.cache_ttl_ms,
        )
      }

      return JSON.stringify({
        agent: args.agent,
        session_id: childId,
        success: true,
        output: lastOutput || "(no text output)",
        task_type: taskType,
        model: "",
        retries_used: retriesUsed,
        duration_ms: Date.now() - startTime,
      })
    },
  })
}
