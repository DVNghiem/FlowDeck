import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { recordRun } from "../services/agent-performance"
import { routeModel } from "../services/model-router"
import { normalizeTaskType, shouldRetry } from "./dispatch-routing"

interface PipelineStep {
  agent: string
  prompt: string
  task_type?: string
}

interface StepTrace {
  agent: string
  session_id?: string
  task_type?: string
  model?: string
  input: string
  output: string
  duration_ms: number
  success: boolean
}

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

export function createRunPipelineTool(client: OpencodeClient): ToolDefinition {
  return tool({
    description: "Run agents in sequential pipeline. Each step's output is appended to the next step's context. One fresh child session per step. Returns full trace with session ID, input/output/duration per step.",
    args: {
      steps: tool.schema.array(tool.schema.object({
        agent: tool.schema.string(),
        prompt: tool.schema.string(),
        task_type: tool.schema.string().optional(),
      })),
      initial_context: tool.schema.string().optional(),
      abort_on_failure: tool.schema.boolean().optional().default(true),
      retry_attempts: tool.schema.number().optional().default(1),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const trace: StepTrace[] = []
      let carryContext = args.initial_context ?? ""
      let aborted = false
      const retryAttempts = typeof args.retry_attempts === "number" ? args.retry_attempts : 1
      const maxRetries = Math.max(0, Math.floor(retryAttempts))

      // Track inflight child session so abort can cancel it mid-execution
      let inflightChildId: string | null = null
      const abortHandler = () => {
        if (inflightChildId) {
          client.session.abort({
            path: { id: inflightChildId },
            query: { directory: context.directory },
          }).catch(() => {})
        }
      }
      context.abort.addEventListener("abort", abortHandler)

      try {
        for (const step of args.steps) {
          if (context.abort.aborted) {
            aborted = true
            break
          }

          const stepStart = Date.now()
          const taskType = normalizeTaskType(step.task_type, step.agent)
          const routing = routeModel(context.directory, taskType)
          const stepInput = carryContext
            ? `${carryContext}\n\n---\n\n${step.prompt}`
            : step.prompt

          // Fresh session per step — prevents cumulative hidden state
          const createRes = await client.session.create({
            body: { parentID: context.sessionID, title: `${step.agent}-pipeline` },
            query: { directory: context.directory },
          })

          if (createRes.error || !createRes.data?.id) {
            const errMsg = `Failed to create session: ${(createRes.error as any)?.detail ?? "unknown"}`
            trace.push({ agent: step.agent, task_type: taskType, model: routing.model, input: stepInput, output: errMsg, duration_ms: Date.now() - stepStart, success: false })
            aborted = true
            break
          }

          inflightChildId = createRes.data.id

          let promptRes: any = null
          let retriesUsed = 0
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            promptRes = await client.session.prompt({
              path: { id: inflightChildId },
              body: {
                agent: step.agent,
                model: routing.model as any,
                parts: [{ type: "text", text: stepInput }],
                tools: { question: false },
              } as any,
              query: { directory: context.directory },
            })
            if (!shouldRetry(promptRes) || attempt === maxRetries) break
            retriesUsed++
          }

          inflightChildId = null

          if (context.abort.aborted) {
            aborted = true
            break
          }

          if (!promptRes || promptRes.error) {
            const errMsg = `Prompt failed: ${(promptRes?.error as any)?.detail ?? "unknown"}`
            trace.push({ agent: step.agent, session_id: createRes.data.id, task_type: taskType, model: routing.model, input: stepInput, output: `${errMsg}${retriesUsed > 0 ? ` (retries: ${retriesUsed})` : ""}`, duration_ms: Date.now() - stepStart, success: false })
            recordRun(context.directory, step.agent, routing.model, taskType, false, Date.now() - stepStart)
            if (args.abort_on_failure) { aborted = true; break }
            continue
          }

          const info = promptRes.data?.info
          if (info?.error) {
            const errMsg = `Agent error: ${JSON.stringify(info.error)}`
            trace.push({ agent: step.agent, session_id: createRes.data.id, task_type: taskType, model: routing.model, input: stepInput, output: `${errMsg}${retriesUsed > 0 ? ` (retries: ${retriesUsed})` : ""}`, duration_ms: Date.now() - stepStart, success: false })
            recordRun(context.directory, step.agent, routing.model, taskType, false, Date.now() - stepStart)
            if (args.abort_on_failure) { aborted = true; break }
            continue
          }

          const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)
          trace.push({ agent: step.agent, session_id: createRes.data.id, task_type: taskType, model: routing.model, input: stepInput, output: output || "(no text output)", duration_ms: Date.now() - stepStart, success: true })
          recordRun(context.directory, step.agent, routing.model, taskType, true, Date.now() - stepStart)

          // Pass this step's output as context to the next step
          carryContext = output
        }
      } finally {
        context.abort.removeEventListener("abort", abortHandler)
      }

      return JSON.stringify({
        steps: trace,
        total_duration_ms: Date.now() - startTime,
        aborted,
      })
    },
  })
}
