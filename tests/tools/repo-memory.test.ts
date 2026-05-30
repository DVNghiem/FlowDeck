import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { repoMemoryTool } from "@/tools/repo-memory"

const TMP = join(process.cwd(), ".test-tmp-memory")

const ctx = { directory: TMP, sessionID: "test", messageID: "test", agent: "test", worktree: TMP, abort: new AbortController().signal } as any

function makeCtx() {
  return ctx
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe("repo-memory tool", () => {
  it("read on empty repo returns empty node list", async () => {
    const result = JSON.parse(await repoMemoryTool.execute({ action: "read" }, makeCtx()) as string)
    expect(result.nodes).toEqual([])
  })

  it("write_node creates a node and read retrieves it", async () => {
    const node = {
      type: "module" as const,
      path: "src/auth",
      owner: "alice",
      tags: ["auth", "security"],
      dependencies: ["src/db"],
      dependents: ["src/api"],
      bug_history: ["CVE-2023-001"],
      conventions: ["use-bcrypt"],
    }
    const writeResult = JSON.parse(await repoMemoryTool.execute({ action: "write_node", node_id: "auth-module", node }, makeCtx()) as string)
    expect(writeResult.success).toBe(true)
    expect(writeResult.node_id).toBe("auth-module")

    const readResult = JSON.parse(await repoMemoryTool.execute({ action: "read", node_id: "auth-module" }, makeCtx()) as string)
    expect(readResult.id).toBe("auth-module")
    expect(readResult.owner).toBe("alice")
    expect(readResult.tags).toContain("security")
  })

  it("query by type returns matching nodes", async () => {
    const base = { owner: undefined, tags: [], dependencies: [], dependents: [], bug_history: [], conventions: [] }
    await repoMemoryTool.execute({ action: "write_node", node_id: "n1", node: { type: "module" as const, path: "src/foo", ...base } }, makeCtx())
    await repoMemoryTool.execute({ action: "write_node", node_id: "n2", node: { type: "api" as const, path: "src/bar", ...base } }, makeCtx())

    const result = JSON.parse(await repoMemoryTool.execute({ action: "query", query: { type: "module" } }, makeCtx()) as string)
    expect(result.count).toBe(1)
    expect(result.nodes[0].id).toBe("n1")
  })

  it("query by path_prefix filters correctly", async () => {
    const base = { owner: undefined, tags: [], dependencies: [], dependents: [], bug_history: [], conventions: [] }
    await repoMemoryTool.execute({ action: "write_node", node_id: "n1", node: { type: "module" as const, path: "src/auth/login", ...base } }, makeCtx())
    await repoMemoryTool.execute({ action: "write_node", node_id: "n2", node: { type: "module" as const, path: "src/payment/stripe", ...base } }, makeCtx())

    const result = JSON.parse(await repoMemoryTool.execute({ action: "query", query: { path_prefix: "src/auth" } }, makeCtx()) as string)
    expect(result.count).toBe(1)
    expect(result.nodes[0].id).toBe("n1")
  })

  it("delete_node removes the node", async () => {
    const base = { owner: undefined, tags: [], dependencies: [], dependents: [], bug_history: [], conventions: [] }
    await repoMemoryTool.execute({ action: "write_node", node_id: "to-delete", node: { type: "module" as const, path: "src/x", ...base } }, makeCtx())
    const del = JSON.parse(await repoMemoryTool.execute({ action: "delete_node", node_id: "to-delete" }, makeCtx()) as string)
    expect(del.success).toBe(true)
    const read = JSON.parse(await repoMemoryTool.execute({ action: "read", node_id: "to-delete" }, makeCtx()) as string)
    expect(read.error).toMatch(/not found/)
  })

  it("write_node without node_id returns error", async () => {
    const result = JSON.parse(await repoMemoryTool.execute({ action: "write_node" }, makeCtx()) as string)
    expect(result.error).toBeTruthy()
  })

  it("delete_node on missing id returns error", async () => {
    const result = JSON.parse(await repoMemoryTool.execute({ action: "delete_node", node_id: "ghost" }, makeCtx()) as string)
    expect(result.error).toMatch(/not found/)
  })
})
