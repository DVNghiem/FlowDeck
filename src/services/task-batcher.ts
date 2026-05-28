/**
 * Task Batcher
 *
 * Coalesces multiple homogeneous cheap tasks into a single agent call.
 * Reduces N session creations + system-prompt injections to 1 for
 * classification/validation batches.
 *
 * SAFETY CONSTRAINTS:
 * - Max 5 tasks per batch (avoid context contamination in large batches)
 * - Each task must have a unique, non-empty id
 * - Partial salvage: successfully parsed results are returned even if
 *   others fail — caller decides how to handle failures
 * - The batcher builds prompts and parses responses; session creation
 *   is the caller's responsibility (use with `delegate`)
 */

export const TASK_BATCHER_MAX_SIZE = 5

export interface BatchTask {
  id: string
  prompt: string
}

export interface BatchResult {
  id: string
  result: string
  success: boolean
  error?: string
}

export interface BatchResponse {
  results: BatchResult[]
  success_count: number
  failure_count: number
}

/**
 * Build a single batched prompt from multiple tasks.
 * The expected response is a JSON array with `id` and `result` fields.
 */
export function buildBatchPrompt(tasks: BatchTask[]): string {
  const items = tasks
    .map((t, i) => `${i + 1}. [id: ${t.id}] ${t.prompt}`)
    .join("\n")
  return `You are processing ${tasks.length} independent tasks. Answer each one concisely.

Tasks:
${items}

Respond with a JSON array ONLY. Each element must have exactly these fields:
- "id": the task id string (copy exactly from the task)
- "result": your answer as a string

Example format:
[{"id": "task1", "result": "..."}, {"id": "task2", "result": "..."}]

Do not include any text before or after the JSON array.`
}

/**
 * Parse a batched model response into per-task results.
 * Returns partial results: tasks whose ids appear in the response are
 * marked success, missing tasks are marked failure.
 */
export function parseBatchResponse(tasks: BatchTask[], rawResponse: string): BatchResponse {
  const results: BatchResult[] = []

  // Try to extract a JSON array from the response
  const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    for (const task of tasks) {
      results.push({ id: task.id, result: "", success: false, error: "no JSON array in response" })
    }
    return { results, success_count: 0, failure_count: tasks.length }
  }

  let parsed: Array<{ id: string; result: string }> = []
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    for (const task of tasks) {
      results.push({
        id: task.id,
        result: "",
        success: false,
        error: `JSON parse error: ${(e as Error).message}`,
      })
    }
    return { results, success_count: 0, failure_count: tasks.length }
  }

  const resultMap = new Map(
    parsed
      .filter(
        (p): p is { id: string; result: string } =>
          typeof p === "object" &&
          p !== null &&
          typeof p.id === "string" &&
          typeof p.result === "string",
      )
      .map(p => [p.id, p.result]),
  )

  let successCount = 0
  let failureCount = 0
  for (const task of tasks) {
    const result = resultMap.get(task.id)
    if (result !== undefined) {
      results.push({ id: task.id, result, success: true })
      successCount++
    } else {
      results.push({
        id: task.id,
        result: "",
        success: false,
        error: "task id not found in response",
      })
      failureCount++
    }
  }

  return { results, success_count: successCount, failure_count: failureCount }
}

/**
 * Validate that a batch is safe to send.
 * Returns null if valid, or an error message if not.
 */
export function validateBatch(tasks: BatchTask[]): string | null {
  if (tasks.length === 0) return "batch is empty"
  if (tasks.length > TASK_BATCHER_MAX_SIZE) {
    return `batch size ${tasks.length} exceeds maximum ${TASK_BATCHER_MAX_SIZE}`
  }
  const ids = tasks.map(t => t.id)
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== ids.length) return "duplicate task ids in batch"
  if (tasks.some(t => !t.id.trim() || !t.prompt.trim())) {
    return "tasks must have non-empty id and prompt"
  }
  return null
}
