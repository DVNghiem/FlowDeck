import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { failureReplayTool } from "@/tools/failure-replay"

const TMP = join(process.cwd(), ".test-tmp-failure")
const ctx = { directory: TMP, sessionID: "test", messageID: "test", agent: "test", worktree: TMP, abort: new AbortController().signal } as any

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

const baseEntry = {
  id: "fail-001",
  type: "reverted_commit" as const,
  description: "Auth refactor caused session invalidation",
  affected_paths: ["src/auth", "src/session"],
  root_cause: "missing token refresh logic",
  fix_applied: "added refresh endpoint",
  tags: ["auth", "regression"],
}

describe("failure-replay tool", () => {
  it("list on empty store returns empty", async () => {
    const result = JSON.parse(await failureReplayTool.execute({ action: "list" }, ctx) as string)
    expect(result.count).toBe(0)
    expect(result.entries).toEqual([])
  })

  it("record stores a failure and list returns it", async () => {
    await failureReplayTool.execute({ action: "record", entry: baseEntry }, ctx)
    const list = JSON.parse(await failureReplayTool.execute({ action: "list" }, ctx) as string)
    expect(list.count).toBe(1)
    expect(list.entries[0].id).toBe("fail-001")
    expect(list.entries[0].recurrence_count).toBe(1)
  })

  it("recording same id increments recurrence_count", async () => {
    await failureReplayTool.execute({ action: "record", entry: baseEntry }, ctx)
    await failureReplayTool.execute({ action: "record", entry: baseEntry }, ctx)
    const list = JSON.parse(await failureReplayTool.execute({ action: "list" }, ctx) as string)
    expect(list.entries[0].recurrence_count).toBe(2)
  })

  it("query by path_prefix matches affected paths", async () => {
    await failureReplayTool.execute({ action: "record", entry: baseEntry }, ctx)
    const result = JSON.parse(await failureReplayTool.execute({ action: "query", query: { path_prefix: "src/auth" } }, ctx) as string)
    expect(result.count).toBe(1)
  })

  it("query by type filters correctly", async () => {
    await failureReplayTool.execute({ action: "record", entry: baseEntry }, ctx)
    await failureReplayTool.execute({ action: "record", entry: { ...baseEntry, id: "fail-002", type: "flaky_test" as const } }, ctx)

    const result = JSON.parse(await failureReplayTool.execute({ action: "query", query: { type: "flaky_test" } }, ctx) as string)
    expect(result.count).toBe(1)
    expect(result.entries[0].id).toBe("fail-002")
  })

  it("mark_resolved adds resolved tag", async () => {
    await failureReplayTool.execute({ action: "record", entry: baseEntry }, ctx)
    const res = JSON.parse(await failureReplayTool.execute({ action: "mark_resolved", entry_id: "fail-001" }, ctx) as string)
    expect(res.success).toBe(true)

    const list = JSON.parse(await failureReplayTool.execute({ action: "list" }, ctx) as string)
    // mark_resolved adds "resolved" tag; list is summary only — verify via query
    const q = JSON.parse(await failureReplayTool.execute({ action: "query", query: { tag: "resolved" } }, ctx) as string)
    expect(q.count).toBe(1)
  })

  it("mark_resolved on missing id returns error", async () => {
    const result = JSON.parse(await failureReplayTool.execute({ action: "mark_resolved", entry_id: "ghost" }, ctx) as string)
    expect(result.error).toMatch(/not found/)
  })

  it("record without entry returns error", async () => {
    const result = JSON.parse(await failureReplayTool.execute({ action: "record" }, ctx) as string)
    expect(result.error).toBeTruthy()
  })
})
