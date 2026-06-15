import { tool } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { existsSync, mkdirSync, appendFileSync } from "fs"
import { join } from "path"
import { resolveAgentModels, parseModelSpec, type FlowDeckConfig } from "../config/agent-models"

interface BackgroundTask {
  taskId: string
  agent: string
  sessionId: string
  startedAt: number
  status: "running" | "complete" | "failed" | "timeout"
  output?: string
  error?: string
}

const activeTasks = new Map<string, BackgroundTask>()
const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 min

function getLogDir(directory: string): string {
  return join(directory, ".flowdeck", "logs")
}

function ensureLogDir(directory: string): void {
  const dir = getLogDir(directory)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function logPath(directory: string, taskId: string): string {
  return join(getLogDir(directory), `${taskId}.log`)
}

function appendLog(directory: string, taskId: string, line: string): void {
  try {
    ensureLogDir(directory)
    appendFileSync(logPath(directory, taskId), `${line}\n`, "utf-8")
  } catch {
    // Best-effort logging only.
  }
}

function getAgentModel(config: FlowDeckConfig | undefined, agent: string) {
  if (!config) return undefined
  const models = resolveAgentModels(config)
  const spec = models[agent]
  return spec ? parseModelSpec(spec) : undefined
}

export function createBackgroundAgentTool(
  client: OpencodeClient,
  getConfig?: () => FlowDeckConfig,
) {
  return tool({
    description: "Spawn a subagent to run a task in the background. Returns a taskId immediately — the agent runs async. Use check-background-agent to poll for results. Use this for long-running tasks so the orchestrator can continue other work.",
    args: {
      agent: tool.schema.string(),
      task: tool.schema.string(),
      taskId: tool.schema.string().optional(), // custom label
    },
    async execute(args, context) {
      const taskId = args.taskId ?? `${args.agent}-${Date.now()}`

      const createRes = await client.session.create({
        body: { parentID: context.sessionID, title: `bg:${taskId}` },
        query: { directory: context.directory },
      })

      if (createRes.error || !createRes.data?.id) {
        return `Error: failed to create background session for ${args.agent}`
      }

      const childId = createRes.data.id

      const task: BackgroundTask = {
        taskId,
        agent: args.agent,
        sessionId: childId,
        startedAt: Date.now(),
        status: "running",
      }
      activeTasks.set(taskId, task)

      appendLog(context.directory, taskId, `Started background task ${taskId} for @${args.agent}`)

      const model = getAgentModel(getConfig?.(), args.agent)

      // Fire and don't await — run in background
      ;(async () => {
        try {
          await client.session.promptAsync({
            path: { id: childId },
            body: {
              agent: args.agent,
              ...(model ? { model } : {}),
              parts: [{ type: "text", text: args.task }],
            },
            query: { directory: context.directory },
          })

          // Poll session.idle via event subscription
          const sub = await client.event.subscribe({ query: { directory: context.directory } })
          const stream = sub.stream

          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              task.status = "timeout"
              task.error = `Timed out after ${POLL_TIMEOUT_MS / 60000} min`
              appendLog(context.directory, taskId, `TIMEOUT: ${task.error}`)
              resolve()
            }, POLL_TIMEOUT_MS)

            const reader = (async () => {
              for await (const event of stream) {
                const ev = event as any
                const sessionID = ev?.properties?.sessionID ?? ev?.properties?.sessionId ?? ev?.sessionID
                const type = ev?.type
                if (sessionID === childId && (type === "session.idle" || type === "session.status")) {
                  clearTimeout(timer)
                  resolve()
                  break
                }
              }
            })()

            reader.catch(() => {
              clearTimeout(timer)
              resolve()
            })
          })

          if (task.status === "running") {
            const msgs = await client.session.messages({ path: { id: childId } })
            const output = (msgs.data ?? [])
              .filter((m: any) => m.role === "assistant")
              .flatMap((m: any) => m.parts ?? [])
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text ?? "")
              .join("\n")
              .trim()

            task.status = output ? "complete" : "failed"
            task.output = output
            task.error = output ? undefined : "Agent produced no output"
            appendLog(context.directory, taskId, output || "Agent produced no output")
          }
        } catch (e) {
          task.status = "failed"
          task.error = e instanceof Error ? e.message : String(e)
          appendLog(context.directory, taskId, `ERROR: ${task.error}`)
        }
      })()

      return JSON.stringify({
        taskId,
        agent: args.agent,
        status: "running",
        message: `Background task started. Poll with check-background-agent taskId="${taskId}"`,
      })
    },
  })
}

export function createCheckBackgroundAgentTool() {
  return tool({
    description: "Check the status and output of a background agent task previously started with background-agent.",
    args: {
      taskId: tool.schema.string(),
    },
    async execute(args) {
      const task = activeTasks.get(args.taskId)
      if (!task) return `No background task found with id: ${args.taskId}`

      if (task.status === "running") {
        const elapsed = Math.round((Date.now() - task.startedAt) / 1000)
        return JSON.stringify({ taskId: args.taskId, status: "running", elapsedSeconds: elapsed })
      }

      activeTasks.delete(args.taskId) // cleanup completed tasks
      return JSON.stringify({
        taskId: args.taskId,
        agent: task.agent,
        status: task.status,
        output: task.output,
        error: task.error,
      })
    },
  })
}

export function createListBackgroundAgentsTool() {
  return tool({
    description: "List all active background agent tasks and their current status.",
    args: {},
    async execute() {
      if (activeTasks.size === 0) return "No active background tasks."
      return JSON.stringify(
        [...activeTasks.values()].map(t => ({
          taskId: t.taskId,
          agent: t.agent,
          status: t.status,
          elapsedSeconds: Math.round((Date.now() - t.startedAt) / 1000),
        }))
      )
    },
  })
}

/** Test helper to inject a controlled task registry. */
export function setTaskRegistryForTest(registry: Map<string, BackgroundTask>): void {
  activeTasks.clear()
  for (const [k, v] of registry) activeTasks.set(k, v)
}

/** Test helper to read the active task registry. */
export function getTaskRegistryForTest(): Map<string, BackgroundTask> {
  return activeTasks
}
