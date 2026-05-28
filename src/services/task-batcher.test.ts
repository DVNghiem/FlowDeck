/**
 * Task Batcher Tests
 *
 * Covers:
 * - validateBatch: empty, oversized, duplicate ids, missing fields
 * - buildBatchPrompt: includes all task ids and prompts
 * - parseBatchResponse: successful parse returns all results
 * - parseBatchResponse: partial salvage when some ids missing
 * - parseBatchResponse: no JSON array → all failed
 * - parseBatchResponse: malformed JSON → all failed
 * - parseBatchResponse: filters out non-object entries
 */
import { describe, it, expect } from "vitest"
import {
  validateBatch,
  buildBatchPrompt,
  parseBatchResponse,
  TASK_BATCHER_MAX_SIZE,
} from "./task-batcher"

describe("validateBatch", () => {
  it("returns null for valid batch", () => {
    const tasks = [
      { id: "t1", prompt: "classify this" },
      { id: "t2", prompt: "validate that" },
    ]
    expect(validateBatch(tasks)).toBeNull()
  })

  it("rejects empty batch", () => {
    expect(validateBatch([])).toBe("batch is empty")
  })

  it("rejects oversized batch", () => {
    const tasks = Array.from({ length: TASK_BATCHER_MAX_SIZE + 1 }, (_, i) => ({
      id: `t${i}`,
      prompt: "task",
    }))
    expect(validateBatch(tasks)).toContain("exceeds maximum")
  })

  it("rejects duplicate ids", () => {
    const tasks = [
      { id: "t1", prompt: "first" },
      { id: "t1", prompt: "second" },
    ]
    expect(validateBatch(tasks)).toBe("duplicate task ids in batch")
  })

  it("rejects empty id", () => {
    expect(validateBatch([{ id: "", prompt: "valid" }])).toContain("non-empty")
  })

  it("rejects empty prompt", () => {
    expect(validateBatch([{ id: "t1", prompt: "   " }])).toContain("non-empty")
  })
})

describe("buildBatchPrompt", () => {
  it("includes all task ids in the prompt", () => {
    const tasks = [
      { id: "classify-1", prompt: "Is this a bug?" },
      { id: "validate-2", prompt: "Is this valid JSON?" },
    ]
    const prompt = buildBatchPrompt(tasks)
    expect(prompt).toContain("classify-1")
    expect(prompt).toContain("validate-2")
    expect(prompt).toContain("Is this a bug?")
    expect(prompt).toContain("Is this valid JSON?")
  })

  it("instructs model to return JSON array", () => {
    const prompt = buildBatchPrompt([{ id: "t1", prompt: "task" }])
    expect(prompt).toContain("JSON array")
    expect(prompt).toContain('"id"')
    expect(prompt).toContain('"result"')
  })
})

describe("parseBatchResponse", () => {
  it("returns all results on valid JSON response", () => {
    const tasks = [
      { id: "t1", prompt: "first" },
      { id: "t2", prompt: "second" },
    ]
    const response = JSON.stringify([
      { id: "t1", result: "answer1" },
      { id: "t2", result: "answer2" },
    ])
    const batch = parseBatchResponse(tasks, response)
    expect(batch.success_count).toBe(2)
    expect(batch.failure_count).toBe(0)
    expect(batch.results[0]).toMatchObject({ id: "t1", result: "answer1", success: true })
    expect(batch.results[1]).toMatchObject({ id: "t2", result: "answer2", success: true })
  })

  it("partial salvage when some ids are missing", () => {
    const tasks = [
      { id: "t1", prompt: "first" },
      { id: "t2", prompt: "second" },
    ]
    const response = JSON.stringify([{ id: "t1", result: "only-one" }])
    const batch = parseBatchResponse(tasks, response)
    expect(batch.success_count).toBe(1)
    expect(batch.failure_count).toBe(1)
    expect(batch.results.find(r => r.id === "t1")?.success).toBe(true)
    expect(batch.results.find(r => r.id === "t2")?.success).toBe(false)
  })

  it("all failed when no JSON array in response", () => {
    const tasks = [{ id: "t1", prompt: "first" }]
    const batch = parseBatchResponse(tasks, "Here is my answer: sure")
    expect(batch.success_count).toBe(0)
    expect(batch.failure_count).toBe(1)
    expect(batch.results[0].error).toBe("no JSON array in response")
  })

  it("all failed when JSON is malformed", () => {
    const tasks = [{ id: "t1", prompt: "first" }]
    const batch = parseBatchResponse(tasks, "[{invalid json}]")
    expect(batch.success_count).toBe(0)
    expect(batch.failure_count).toBe(1)
    expect(batch.results[0].error).toContain("JSON parse error")
  })

  it("extracts JSON array even with surrounding prose", () => {
    const tasks = [{ id: "t1", prompt: "first" }]
    const response = 'Here is the result:\n[{"id": "t1", "result": "found"}]\nDone.'
    const batch = parseBatchResponse(tasks, response)
    expect(batch.success_count).toBe(1)
    expect(batch.results[0].result).toBe("found")
  })

  it("filters out non-object entries in parsed array", () => {
    const tasks = [{ id: "t1", prompt: "first" }]
    const response = '[null, 42, {"id": "t1", "result": "ok"}]'
    const batch = parseBatchResponse(tasks, response)
    expect(batch.success_count).toBe(1)
    expect(batch.results[0].result).toBe("ok")
  })
})
