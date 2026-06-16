import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createExecutionSubstrate,
  validateHandoffPayload,
  resolveWorker,
  createLifecycleLogger,
  watchWorkerStart,
  requiresTaskApproval,
  type HandoffPayload,
  type DelegateContext,
} from "@/services/execution-substrate"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-execution-substrate-test-"))
}

function makeMockClient(events: unknown[] = []) {
  const unsubscribe = vi.fn()
  return {
    session: {
      create: vi.fn().mockResolvedValue({ data: { id: "child-1" }, error: null }),
      promptAsync: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    event: {
      subscribe: vi.fn().mockResolvedValue({
        stream: (async function* () {
          for (const event of events) {
            yield event
          }
        })(),
        unsubscribe,
      }),
    },
    app: {
      log: vi.fn().mockResolvedValue(undefined),
    },
    _unsubscribe: unsubscribe,
  }
}

function validPayload(): HandoffPayload {
  return {
    workerId: "backend-coder",
    workflowId: "standard",
    taskSummary: "Implement the execution substrate service",
    acceptanceCriteria: ["Validation passes", "Worker starts"],
    trace: { runId: "run-1", sessionId: "session-1" },
  }
}

function makeContext(directory: string): DelegateContext {
  return { directory, sessionID: "session-1" }
}

describe("validateHandoffPayload", () => {
  it("accepts a valid payload", () => {
    const result = validateHandoffPayload(validPayload())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.workerId).toBe("backend-coder")
    expect(result.value.workflowId).toBe("standard")
    expect(result.value.budget?.timeoutMs).toBe(60_000)
  })

  it("rejects a missing workerId", () => {
    const payload = { ...validPayload(), workerId: undefined }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("workerId must be a non-empty string")
  })

  it("rejects an unregistered workerId", () => {
    const payload = { ...validPayload(), workerId: "not-an-agent" }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("workerId 'not-an-agent' is not a registered FlowDeck agent")
  })

  it("rejects an invalid workflowId", () => {
    const payload = { ...validPayload(), workflowId: "unknown" }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain(
      "workflowId must be one of: quick, standard, explore, ui-heavy, bugfix, docs-only, verify-heavy",
    )
  })

  it("rejects an empty taskSummary", () => {
    const payload = { ...validPayload(), taskSummary: "" }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("taskSummary must be 1-2000 characters")
  })

  it("rejects an oversized taskSummary", () => {
    const payload = { ...validPayload(), taskSummary: "a".repeat(2001) }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("taskSummary must be 1-2000 characters")
  })

  it("rejects an empty acceptanceCriteria array", () => {
    const payload = { ...validPayload(), acceptanceCriteria: [] }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("acceptanceCriteria must be a non-empty array")
  })

  it("rejects an acceptanceCriteria entry that is empty", () => {
    const payload = { ...validPayload(), acceptanceCriteria: ["valid", ""] }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("acceptanceCriteria[1] must be a non-empty string")
  })

  it("rejects unsafe target paths with ..", () => {
    const payload = { ...validPayload(), targets: ["../secrets"] }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("targets[0] contains unsafe path segments: ../secrets")
  })

  it("rejects absolute target paths", () => {
    const payload = { ...validPayload(), targets: ["/etc/passwd"] }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain("targets[0] contains unsafe path segments: /etc/passwd")
  })

  it("caps budget.timeoutMs at 10 minutes", () => {
    const payload = { ...validPayload(), budget: { timeoutMs: 999_999_999 } }
    const result = validateHandoffPayload(payload)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.budget?.timeoutMs).toBe(10 * 60 * 1000)
  })

  it("defaults budget.timeoutMs to 60 seconds when omitted", () => {
    const result = validateHandoffPayload(validPayload())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.budget?.timeoutMs).toBe(60_000)
  })
})

describe("resolveWorker", () => {
  it("resolves a known worker", () => {
    const worker = resolveWorker("backend-coder")
    expect(worker).not.toBeNull()
    expect(worker?.name).toBe("backend-coder")
  })

  it("returns null for an unknown worker", () => {
    const worker = resolveWorker("not-an-agent")
    expect(worker).toBeNull()
  })
})

describe("requiresTaskApproval", () => {
  it("returns true for verify-heavy workflow", () => {
    expect(requiresTaskApproval({ ...validPayload(), workflowId: "verify-heavy" })).toBe(true)
  })

  it("returns true for sensitive target /env", () => {
    expect(requiresTaskApproval({ ...validPayload(), targets: ["config/.env"] })).toBe(true)
  })

  it("returns true for target ending with .pem", () => {
    expect(requiresTaskApproval({ ...validPayload(), targets: ["certs/id.pem"] })).toBe(true)
  })

  it("returns true when maxTokens exceeds threshold", () => {
    expect(
      requiresTaskApproval({ ...validPayload(), budget: { maxTokens: 100_001 } }),
    ).toBe(true)
  })

  it("returns false for ordinary quick task", () => {
    expect(requiresTaskApproval({ ...validPayload(), workflowId: "quick" })).toBe(false)
  })
})

describe("createExecutionSubstrate", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("returns validation error for malformed payload", async () => {
    const client = makeMockClient()
    const substrate = createExecutionSubstrate(client as any, () => ({}))
    const result = await substrate.handoff(
      { ...validPayload(), taskSummary: "" } as unknown as HandoffPayload,
      makeContext(dir),
    )
    expect(result.status).toBe("error")
    if (result.status !== "error") return
    expect(result.error).toContain("Invalid handoff payload")
  })

  it("returns error for unknown worker", async () => {
    const client = makeMockClient()
    const substrate = createExecutionSubstrate(client as any, () => ({}))
    const result = await substrate.handoff(
      { ...validPayload(), workerId: "not-an-agent" },
      makeContext(dir),
    )
    expect(result.status).toBe("error")
    if (result.status !== "error") return
    expect(result.error).toContain("Invalid handoff payload")
  })

  it("returns error when read-only agent receives targets outside allowed workflows", async () => {
    const client = makeMockClient()
    const substrate = createExecutionSubstrate(client as any, () => ({}))
    const result = await substrate.handoff(
      {
        ...validPayload(),
        workerId: "reviewer",
        workflowId: "standard",
        targets: ["src/index.ts"],
      },
      makeContext(dir),
    )
    expect(result.status).toBe("error")
    if (result.status !== "error") return
    expect(result.error).toContain("Read-only agent 'reviewer'")
  })

  it("allows read-only agent with targets in explore workflow", async () => {
    const client = makeMockClient([
      {
        type: "message.part.updated",
        properties: { sessionID: "child-1", part: { type: "text", text: "ok" } },
      },
    ])
    const substrate = createExecutionSubstrate(client as any, () => ({}))
    const result = await substrate.handoff(
      {
        ...validPayload(),
        workerId: "reviewer",
        workflowId: "explore",
        targets: ["src/index.ts"],
      },
      makeContext(dir),
    )
    expect(result.status).toBe("running")
  })

  it("returns approval_required before invoking worker for sensitive targets", async () => {
    const client = makeMockClient()
    const substrate = createExecutionSubstrate(client as any, () => ({}))
    const result = await substrate.handoff(
      { ...validPayload(), targets: ["config/secrets.json"] },
      makeContext(dir),
    )
    expect(result.status).toBe("approval_required")
    if (result.status !== "approval_required") return
    expect(result.approvalId).toBeTruthy()
    expect(client.session.create).not.toHaveBeenCalled()
  })

  it("creates and prompts a worker session on success", async () => {
    const client = makeMockClient([
      {
        type: "message.part.updated",
        properties: { sessionID: "child-1", part: { type: "text", text: "ok" } },
      },
    ])
    const substrate = createExecutionSubstrate(client as any, () => ({
      agentModels: { "backend-coder": { model: "openai/gpt-4o" } },
    }))

    const result = await substrate.handoff(validPayload(), makeContext(dir))

    expect(result.status).toBe("running")
    if (result.status !== "running") return
    expect(result.childSessionId).toBe("child-1")
    expect(client.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ parentID: "session-1" }),
        query: { directory: dir },
      }),
    )
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: "child-1" },
        body: expect.objectContaining({
          agent: "backend-coder",
          model: { providerID: "openai", modelID: "gpt-4o" },
          parts: [{ type: "text", text: expect.stringContaining("Implement the execution substrate service") }],
        }),
        query: { directory: dir },
      }),
    )
  })

  it("falls back to default-executor for quick workflow", async () => {
    const client = makeMockClient([
      {
        type: "message.part.updated",
        properties: { sessionID: "fallback-1", part: { type: "text", text: "ok" } },
      },
    ])
    client.session.create
      .mockResolvedValueOnce({ data: null, error: "first failure" })
      .mockResolvedValueOnce({ data: { id: "fallback-1" }, error: null })
    const substrate = createExecutionSubstrate(client as any, () => ({}))

    const result = await substrate.handoff(
      { ...validPayload(), workerId: "backend-coder", workflowId: "quick" },
      makeContext(dir),
    )

    expect(result.status).toBe("running")
    if (result.status !== "running") return
    expect(result.childSessionId).toBe("fallback-1")
    expect(client.session.create).toHaveBeenCalledTimes(2)
  })

  it("returns error for standard workflow when invocation fails", async () => {
    const client = makeMockClient()
    client.session.create.mockResolvedValue({ data: null, error: "creation failed" })
    const substrate = createExecutionSubstrate(client as any, () => ({}))

    const result = await substrate.handoff(validPayload(), makeContext(dir))

    expect(result.status).toBe("error")
    if (result.status !== "error") return
    expect(result.error).toContain("creation failed")
  })
})

describe("createLifecycleLogger", () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("calls appLog with a prefixed line and appends JSONL", () => {
    const appLog = vi.fn()
    const log = createLifecycleLogger({ appLog, directory: dir })
    const payload = validPayload()
    log({
      runId: payload.trace.runId,
      sessionId: payload.trace.sessionId,
      timestamp: Date.now(),
      workerId: payload.workerId,
      workflowId: payload.workflowId,
      status: "routing_started",
    })

    expect(appLog).toHaveBeenCalledWith(
      expect.stringContaining("[handoff-lifecycle] routing_started"),
    )

    const eventsPath = join(dir, ".opencode", "flowdeck-events.jsonl")
    expect(existsSync(eventsPath)).toBe(true)
    const lines = readFileSync(eventsPath, "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)
    const record = JSON.parse(lines[0])
    expect(record.status).toBe("routing_started")
    expect(record.workerId).toBe("backend-coder")
  })
})

describe("watchWorkerStart", () => {
  it("resolves started=true on first child event", async () => {
    const client = makeMockClient([
      {
        type: "message.part.updated",
        properties: { sessionID: "child-1", part: { type: "text", text: "ok" } },
      },
    ])
    const signal = await watchWorkerStart("child-1", 1000, client as any, "/tmp")
    expect(signal.started).toBe(true)
    expect(client._unsubscribe).toHaveBeenCalled()
  })

  it("resolves started=false on timeout", async () => {
    const unsubscribe = vi.fn()
    const client = {
      event: {
        subscribe: vi.fn().mockResolvedValue({
          stream: (async function* () {
            // Never yield or return so the reader stays active until timeout.
            await new Promise(() => {})
          })(),
          unsubscribe,
        }),
      },
    }
    const signal = await watchWorkerStart("child-1", 10, client as any, "/tmp")
    expect(signal.started).toBe(false)
    expect(signal.reason).toBe("startup_timeout")
    expect(unsubscribe).toHaveBeenCalled()
  })
})
