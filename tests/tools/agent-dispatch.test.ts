import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createDelegateTool } from "@/tools/delegate"
import { createRunPipelineTool } from "@/tools/run-pipeline"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"

// Test directory setup
const TMP = join(process.cwd(), ".test-tmp-agent-dispatch")

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(join(TMP, ".codebase"), { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

// Minimal mock for OpencodeClient
function makeClient(overrides: Partial<{
  createResult: any
  promptResult: any
  abortResult: any
}> = {}) {
  const createResult = overrides.createResult ?? { data: { id: "child-session-1" }, error: null }
  const promptResult = overrides.promptResult ?? {
    data: {
      info: { id: "msg-1", role: "assistant", error: undefined },
      parts: [{ type: "text", text: "Agent output here" }],
    },
    error: null,
  }

  return {
    session: {
      create: vi.fn(async () => createResult),
      prompt: vi.fn(async () => promptResult),
      abort: vi.fn(async () => ({ data: undefined, error: null })),
    },
  }
}

function makeContext(overrides: Partial<{ sessionID: string; directory: string }> = {}) {
  const abortController = new AbortController()
  return {
    sessionID: overrides.sessionID ?? "parent-session",
    messageID: "msg-0",
    agent: "test-agent",
    directory: overrides.directory ?? TMP,
    worktree: overrides.directory ?? TMP,
    abort: abortController.signal,
    metadata: vi.fn(),
    ask: vi.fn(),
    _abort: abortController,
  }
}

// ──────────────────────────────────────────────────────────
// delegate_to_agent
// ──────────────────────────────────────────────────────────
describe("createDelegateTool", () => {
  it("creates one session and returns agent output", async () => {
    const client = makeClient()
    const tool = createDelegateTool(client as any)
    const ctx = makeContext()
    const result = JSON.parse((await tool.execute(
      { agent: "reviewer", prompt: "Review this code", context: "PR diff here" },
      ctx as any,
    )) as string)

    expect(client.session.create).toHaveBeenCalledTimes(1)
    expect(client.session.prompt).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(result.output).toBe("Agent output here")
    expect(result.session_id).toBe("child-session-1")
  })

  it("prepends context to prompt when provided", async () => {
    const client = makeClient()
    const tool = createDelegateTool(client as any)
    const ctx = makeContext()
    await tool.execute({ agent: "reviewer", prompt: "Review", context: "ctx-data" }, ctx as any)

    const promptBody = (client.session.prompt.mock.calls as any)[0][0].body
    expect(promptBody.parts[0].text).toContain("ctx-data")
    expect(promptBody.parts[0].text).toContain("Review")
  })

  it("propagates agent-level error", async () => {
    const client = makeClient({
      promptResult: {
        data: { info: { error: { type: "ApiError", message: "overloaded" } }, parts: [] },
        error: null,
      },
    })
    const tool = createDelegateTool(client as any)
    const ctx = makeContext()
    const result = JSON.parse((await tool.execute({ agent: "backend-coder", prompt: "x" }, ctx as any)) as string)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Agent error")
  })
})

// ──────────────────────────────────────────────────────────
// run_agents_pipeline
// ──────────────────────────────────────────────────────────
describe("createRunPipelineTool", () => {
  it("runs steps sequentially and passes output as context", async () => {
    const client = makeClient()
    client.session.create
      .mockResolvedValueOnce({ data: { id: "step-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "step-2" }, error: null })
    client.session.prompt
      .mockResolvedValueOnce({ data: { info: {}, parts: [{ type: "text", text: "Plan result" }] }, error: null })
      .mockResolvedValueOnce({ data: { info: {}, parts: [{ type: "text", text: "Code result" }] }, error: null })

    const tool = createRunPipelineTool(client as any)
    const ctx = makeContext()
    const result = JSON.parse((await tool.execute(
      { steps: [{ agent: "planner", prompt: "Plan" }, { agent: "backend-coder", prompt: "Code" }], abort_on_failure: true },
      ctx as any,
    )) as string)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].success).toBe(true)
    expect(result.steps[1].success).toBe(true)
    // Second step input should include first step output
    expect(result.steps[1].input).toContain("Plan result")
    expect(result.aborted).toBe(false)
  })

  it("creates a fresh session per step (not reusing)", async () => {
    const client = makeClient()
    client.session.create
      .mockResolvedValueOnce({ data: { id: "step-a" }, error: null })
      .mockResolvedValueOnce({ data: { id: "step-b" }, error: null })

    const tool = createRunPipelineTool(client as any)
    const ctx = makeContext()
    await tool.execute(
      { steps: [{ agent: "planner", prompt: "p1" }, { agent: "backend-coder", prompt: "p2" }], abort_on_failure: true },
      ctx as any,
    )

    expect(client.session.create).toHaveBeenCalledTimes(2)
    // Different session IDs used for each step
    const ids = client.session.prompt.mock.calls.map((c: any) => c[0].path.id)
    expect(ids[0]).toBe("step-a")
    expect(ids[1]).toBe("step-b")
  })

  it("aborts pipeline on step failure when abort_on_failure is true", async () => {
    const client = makeClient({
      promptResult: { data: null, error: { detail: "step failed" } },
    })
    const tool = createRunPipelineTool(client as any)
    const ctx = makeContext()
    const result = JSON.parse((await tool.execute(
      { steps: [{ agent: "planner", prompt: "p1" }, { agent: "backend-coder", prompt: "p2" }], abort_on_failure: true },
      ctx as any,
    )) as string)

    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].success).toBe(false)
    expect(result.aborted).toBe(true)
  })

  it("continues pipeline on failure when abort_on_failure is false", async () => {
    const client = makeClient()
    client.session.create.mockResolvedValue({ data: { id: "s1" }, error: null })
    client.session.prompt
      .mockResolvedValueOnce({ data: null, error: { detail: "step 1 fail" } })
      .mockResolvedValueOnce({ data: { info: {}, parts: [{ type: "text", text: "Step 2 ok" }] }, error: null })

    const tool = createRunPipelineTool(client as any)
    const ctx = makeContext()
    const result = JSON.parse((await tool.execute(
      { steps: [{ agent: "a1", prompt: "p1" }, { agent: "a2", prompt: "p2" }], abort_on_failure: false },
      ctx as any,
    )) as string)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].success).toBe(false)
    expect(result.steps[1].success).toBe(true)
    expect(result.aborted).toBe(false)
  })

  it("aborts inflight child session when parent abort fires mid-step", async () => {
    const client = makeClient()
    let resolvePrompt!: (v: any) => void
    client.session.create.mockResolvedValue({ data: { id: "inflight-child" }, error: null })
    client.session.prompt.mockReturnValueOnce(new Promise(res => { resolvePrompt = res }))

    const tool = createRunPipelineTool(client as any)
    const abortCtrl = new AbortController()
    const ctx = {
      sessionID: "parent-session",
      messageID: "msg-0",
      agent: "test-agent",
      directory: TMP,
      worktree: TMP,
      abort: abortCtrl.signal,
      metadata: vi.fn(),
      ask: vi.fn(),
    }

    const execPromise = tool.execute(
      { steps: [{ agent: "planner", prompt: "Plan" }], abort_on_failure: true },
      ctx as any,
    )

    // Let create + prompt start
    await Promise.resolve()
    await Promise.resolve()

    abortCtrl.abort()
    resolvePrompt({ data: { info: {}, parts: [] }, error: null })
    await execPromise

    expect(client.session.abort).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: "inflight-child" } }),
    )
  })
})
