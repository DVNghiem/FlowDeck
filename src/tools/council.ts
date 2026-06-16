import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"
import { codebaseDir } from "./planning-state-lib"
import { readCodebaseIndex } from "./codebase-index"
import { statePath, parseState } from "./planning-state-lib"
import { readFileSync } from "fs"
import { resolveAgentModels, parseModelSpec, type FlowDeckConfig } from "../config/agent-models"

/** In-memory council cache. Key = hash of task + sorted agents + state/index versions. */
const _councilCache = new Map<string, { synthesis: string; cached_at: number }>()
const COUNCIL_CACHE_TTL_MS = 20 * 60 * 1000 // 20 minutes

function councilCacheKey(
  task: string,
  agents: string[],
  stateVersion: number,
  indexVersion: number,
): string {
  const sorted = [...agents].sort()
  return createHash("sha256")
    .update(JSON.stringify({ task: task.trim(), agents: sorted, sv: stateVersion, iv: indexVersion }))
    .digest("hex")
    .slice(0, 32)
}

/**
 * Run tasks with bounded concurrency.
 * Ensures at most `limit` tasks execute simultaneously, preventing
 * thundering-herd cost spikes when many agents are requested.
 */
async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const idx = next++
      results[idx] = await tasks[idx]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function createCouncilTool(client: OpencodeClient, getConfig?: () => FlowDeckConfig): ToolDefinition {
  return tool({
    description: "Run an ensemble of agents (Council) on the same task to reach consensus or compare approaches. Runs specialized agents in parallel (bounded concurrency) and returns their synthesized outputs.",
    args: {
      task: tool.schema.string(),
      agents: tool.schema.array(tool.schema.string()).optional(),
      /**
       * When true, bypass cache and run a fresh council.
       * Default: false (use cached synthesis if available and state unchanged).
       */
      force_fresh: tool.schema.boolean().optional().default(false),
      /**
       * Maximum number of agent sessions to run concurrently.
       * Default: 3. Reduce to 1 to serialize (cheapest), increase for faster results.
       * Capped at agents.length. Values above 5 are clamped to 5.
       */
      max_concurrency: tool.schema.number().optional().default(3),
    },
    async execute(args, context) {
      const agents = args.agents || ["architect", "reviewer", "backend-coder"]
      const concurrencyLimit = Math.max(1, Math.min(5, typeof args.max_concurrency === "number" ? args.max_concurrency : 3))

      // Resolve current summaryVersions for cache key
      const index = readCodebaseIndex(context.directory)
      const sp = statePath(context.directory)
      const rawState = existsSync(sp) ? readFileSync(sp, "utf-8") : ""
      const state = rawState ? parseState(rawState) : {}
      const stateVersion = typeof state.summaryVersion === "number" ? state.summaryVersion : 0
      const indexVersion = typeof index.summaryVersion === "number" ? index.summaryVersion : 0

      // Check cache — skip when force_fresh or when state changed (different versions)
      if (!args.force_fresh) {
        const cacheKey = councilCacheKey(args.task, agents, stateVersion, indexVersion)
        const cached = _councilCache.get(cacheKey)
        if (cached && Date.now() - cached.cached_at < COUNCIL_CACHE_TTL_MS) {
          return cached.synthesis + "\n\n<!-- council: cached result -->"
        }
      }

      const agentModels = getConfig ? resolveAgentModels(getConfig()) : {}

      const tasks = agents.map(agent => ({
        agent,
        prompt: `TASK: ${args.task}\n\nPlease provide your best analysis/implementation for this task. Your output will be compared with other agents in a council.`,
      }))

      // Run agents with bounded concurrency to prevent cost spikes
      const results = await runWithConcurrencyLimit(
        tasks.map(task => async () => {
          const createRes = await client.session.create({
            body: { parentID: context.sessionID, title: `Council: ${task.agent}` },
            query: { directory: context.directory },
          })

          if (createRes.error || !createRes.data?.id) {
            return { agent: task.agent, error: "Failed to create session" }
          }

          const childId = createRes.data.id
          const modelSpec = agentModels[task.agent]
          const model = modelSpec ? parseModelSpec(modelSpec) : undefined

          const promptRes = await client.session.prompt({
            path: { id: childId },
            body: {
              agent: task.agent,
              ...(model ? { model } : {}),
              parts: [{ type: "text", text: task.prompt }],
            },
            query: { directory: context.directory },
          })

          const output = (promptRes.data?.parts ?? [])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n")

          return { agent: task.agent, output: output || "(no output)" }
        }),
        concurrencyLimit,
      )

      const synthesisPrompt = `You are a Council Synthesizer. Below are the outputs from ${results.length} different agents on the same task.
      
TASK: ${args.task}

${results.map(r => `--- AGENT: ${r.agent} ---\n${r.output}`).join("\n\n")}

Please synthesize these results. Identify areas of agreement, resolve conflicts, and recommend the best path forward.`

      const finalRes = await client.session.prompt({
        path: { id: context.sessionID },
        body: {
          agent: "orchestrator",
          parts: [{ type: "text", text: synthesisPrompt }],
        },
        query: { directory: context.directory },
      })

      const synthesis = (finalRes.data?.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
      persistCouncilResult(context.directory, {
        task: args.task,
        agents,
        results,
        synthesis,
        created_at: new Date().toISOString(),
      })

      // Store in cache
      const cacheKey = councilCacheKey(args.task, agents, stateVersion, indexVersion)
      _councilCache.set(cacheKey, { synthesis, cached_at: Date.now() })

      return synthesis
    },
  })
}

function persistCouncilResult(
  directory: string,
  payload: {
    task: string
    agents: string[]
    results: Array<{ agent: string; output?: string; error?: string }>
    synthesis: string
    created_at: string
  }
): void {
  try {
    const base = codebaseDir(directory)
    if (!existsSync(base)) mkdirSync(base, { recursive: true })
    const path = join(base, "COUNCILS.jsonl")
    appendFileSync(path, JSON.stringify(payload) + "\n", "utf-8")
  } catch {
    // Best-effort persistence only; council synthesis should still return.
  }
}
