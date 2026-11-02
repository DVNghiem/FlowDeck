/**
 * Plugin Entry Integration Tests (OpenCode v2)
 *
 * Covers:
 * - The plugin default export is a V2 definition (`id` + `setup`).
 * - Tool registrations through `ctx.tool.transform`.
 * - Agent registration through `ctx.agent.transform` (incl. default agent).
 * - MCP, command, and skill registration.
 * - Tool hooks call guard-rails + loop detector.
 * - Event subscription wires session.created / session.idle /
 *   session.execution.failed to the session hooks.
 * - Pure mapping helpers: toV2Result, convertMcpConfig, substituteArguments,
 *   parseModelRef, agentEdits, toolInputSchema, eventSessionID.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { z } from "zod"
import { planningDir } from "@/tools/planning-state-lib"
import { loadV2Plugin } from "./helpers/mock-v2-context"
import {
  FLOWDECK_TOOLS,
  PLUGIN_ID,
  agentEdits,
  convertMcpConfig,
  eventSessionID,
  parseModelRef,
  substituteArguments,
  toV2Result,
  toolInputSchema,
} from "@/index"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-index-test-"))
}

function writeState(dir: string): void {
  const pd = planningDir(dir)
  mkdirSync(pd, { recursive: true })
  writeFileSync(join(pd, "STATE.md"), "---\nphase: 1\n---\n# State", "utf-8")
}

describe("plugin definition (v2)", () => {
  it("exposes a v2 plugin definition with id and setup", async () => {
    const mod = await import("@/index")
    const plugin = mod.default
    expect(plugin.id).toBe(PLUGIN_ID)
    expect(PLUGIN_ID).toBe("flowdeck")
    expect(typeof plugin.setup).toBe("function")
  })
it("exposes a v1 server() hook returning the v1 hooks object", async () => {
    const mod = await import("@/index")
    const plugin = mod.default
    expect(typeof plugin.server).toBe("function")
    const dir = makeTempDir()
    try {
      const hooks = await plugin.server({
        directory: dir,
        client: { app: { log: async () => undefined } },
      })
      expect(hooks).toMatchObject({ name: "@dv.nghiem/flowdeck", agent: {} })
      expect(hooks.tool).toBe(FLOWDECK_TOOLS)
      expect(typeof hooks.config).toBe("function")
      expect(typeof hooks["tool.execute.before"]).toBe("function")
      expect(typeof hooks["tool.execute.after"]).toBe("function")
      expect(typeof hooks.event).toBe("function")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("plugin registration", () => {
  let state: Awaited<ReturnType<typeof loadV2Plugin>>

  beforeEach(async () => {
    state = await loadV2Plugin()
  })

  afterEach(async () => {
    await state.dispose()
    rmSync(state.directory, { recursive: true, force: true })
  })

  it("registers the surviving core tools", () => {
    const toolNames = [...state.tools.keys()]
    const expected = [
      "planning-state",
      "codebase-state",
      "repo-memory",
      "hash-edit",
      "load-rules",
      "list-rules",
      "capture-lesson",
      "review-lessons",
      // Without this, deleting the fdx-graph registration would break no test,
      // which is how the tool stayed unreachable for four of its actions.
      "fdx-graph",
    ]
    for (const name of expected) {
      expect(toolNames).toContain(name)
    }
  })

  it("registers every tool with a description and JSON Schema input", () => {
    for (const [name, tool] of state.tools) {
      expect(tool.description, `tool ${name} description`).toBeTruthy()
      expect(tool.input, `tool ${name} input schema`).toEqual(
        expect.objectContaining({ type: "object" }),
      )
      expect(typeof tool.execute, `tool ${name} execute`).toBe("function")
    }
  })

  it("does not register removed tools", () => {
    const toolNames = [...state.tools.keys()]
    expect(toolNames).not.toContain("delegate")
    expect(toolNames).not.toContain("run-pipeline")
    expect(toolNames).not.toContain("council")
    expect(toolNames).not.toContain("decision-trace")
    expect(toolNames).not.toContain("reflect")
  })

  it("registers the 12 agents with orchestrator as default", () => {
    const expected = [
      "orchestrator",
      "planner",
      "architect",
      "researcher",
      "mapper",
      "backend-coder",
      "frontend-coder",
      "devops",
      "tester",
      "reviewer",
      "security-auditor",
      "debug-specialist",
    ]
    for (const name of expected) {
      expect(state.agents.has(name), `agent ${name}`).toBe(true)
      expect(state.agents.get(name).description).toBeTruthy()
      expect(state.agents.get(name).system).toBeTruthy()
    }
    expect(state.agents.get("orchestrator").mode).toBe("primary")
    expect(state.agents.get("planner").mode).toBe("subagent")
    expect(state.defaultAgent).toBe("orchestrator")
  })

  it("applies agent temperature to request body", () => {
    const orchestrator = state.agents.get("orchestrator")
    expect(orchestrator.request.body.temperature).toBe(0.1)
  })

  it("skips a malformed model override without dropping the agent", async () => {
    const configDir = makeTempDir()
    writeFileSync(
      join(configDir, "flowdeck.json"),
      JSON.stringify({ agentModels: { planner: { model: "broken-model" } } }),
      "utf-8",
    )
    const prevConfigDir = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = configDir
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    let badState: Awaited<ReturnType<typeof loadV2Plugin>> | undefined
    try {
      badState = await loadV2Plugin()
      const planner = badState.agents.get("planner")
      // The agent still registers with every non-model field applied.
      expect(planner).toBeDefined()
      expect(planner.model).toBeUndefined()
      expect(planner.description).toBeTruthy()
      expect(planner.mode).toBe("subagent")
      expect(badState.defaultAgent).toBe("orchestrator")
      expect(logSpy.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
        '[flowdeck] invalid model reference for agent "planner": "broken-model" (expected provider/model[#variant])',
      )
    } finally {
      logSpy.mockRestore()
      if (badState) await badState.dispose()
      rmSync(badState?.directory ?? configDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
      if (prevConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
      else process.env.OPENCODE_CONFIG_DIR = prevConfigDir
    }
  })

  it("registers MCP servers in the v2 shape", () => {
    const context7 = state.mcps.get("context7") as any
    expect(context7).toEqual({ type: "remote", url: "https://mcp.context7.com/mcp", oauth: false })
    const memory = state.mcps.get("memory") as any
    expect(memory).toEqual({
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
    })
    // V1-only fields are stripped.
    for (const server of state.mcps.values() as IterableIterator<any>) {
      expect(server.enabled).toBeUndefined()
    }
  })

  it("registers the eight pipeline commands", () => {
    const expected = [
      "fd-task",
      "fd-review",
      "fd-execute",
      "fd-verify",
      "fd-done",
      "fd-checkpoint",
      "fd-resume",
      "fd-status",
    ]
    for (const name of expected) {
      expect(state.commands.has(name), `command ${name}`).toBe(true)
      expect(state.commands.get(name).description).toBeTruthy()
    }
  })

  it("registers the 42 skills", () => {
    expect(state.skills.length).toBe(42)
    const tdd = state.skills.find((s) => s.id === "tdd-workflow")
    expect(tdd).toBeDefined()
    expect(tdd.name).toBe("tdd-workflow")
    expect(tdd.description).toContain("Test-Driven Development")
    expect(tdd.content).toContain("Red-Green-Refactor")
    expect(tdd.path.endsWith("SKILL.md")).toBe(true)
  })

  it("substitutes $ARGUMENTS when a command executes", async () => {
    const fdTask = state.commands.get("fd-task")
    await fdTask.execute({
      sessionID: "sess-1",
      prompt: { text: "build a REST endpoint" },
      delivery: "steer",
    })
    expect(state.sessionPrompts).toHaveLength(1)
    const submitted = state.sessionPrompts[0]
    expect(submitted.sessionID).toBe("sess-1")
    expect(submitted.delivery).toBe("steer")
    expect(String(submitted.text)).toContain("build a REST endpoint")
    expect(String(submitted.text)).not.toContain("$ARGUMENTS")
  })

  it("runs the tool guard on tool.execute.before", async () => {
    const before = state.toolHooks["execute.before"]
    expect(typeof before).toBe("function")

    // Plain read is allowed.
    let threw: unknown = null
    try {
      await before({ tool: "read", sessionID: "sess-1", agent: "build", input: { filePath: "x.ts" } })
    } catch (err) {
      threw = err
    }
    expect(threw).toBeNull()

    // A blocked command escalates.
    let blocked: Error | null = null
    try {
      await before({ tool: "bash", sessionID: "sess-1", agent: "build", input: { command: "rm -rf /" } })
    } catch (err) {
      blocked = err as Error
    }
    expect(blocked).not.toBeNull()
    expect(blocked!.message).toMatch(/rm -rf/)
  })

  it("records tool completions in tool.execute.after", async () => {
    const after = state.toolHooks["execute.after"]
    expect(typeof after).toBe("function")
    let threw: unknown = null
    try {
      await after({
        tool: "read",
        sessionID: "sess-1",
        agent: "build",
        input: { filePath: "x.ts" },
        status: "completed",
        result: { content: "ok" },
      })
    } catch (err) {
      threw = err
    }
    expect(threw).toBeNull()
  })

  it("wires session.created to the session start hook", async () => {
    const dir = makeTempDir()
    writeState(dir)
    try {
      const started = await loadV2Plugin([{ type: "session.created", data: { sessionID: "sess-1" } }])
      await started.flushEvents()
      // sessionStartHook has no direct return we can observe here; the
      // assertion is that processing the event does not throw.
      expect(started.sessionHooks).toBeDefined()
      await started.dispose()
      rmSync(started.directory, { recursive: true, force: true })
    } finally {
      rmSync(planningDir(dir), { recursive: true, force: true })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("writes a flowdeck.log entry on session.idle events", async () => {
    await state.flushEvents()
    // Post-setup events won't be consumed (the stream already closed), so
    // load a fresh plugin seeded with the event. v2.0.24 does not emit
    // session.idle, so the v1 idle path is driven by session.execution.succeeded.
    const idleState = await loadV2Plugin([
      { type: "session.execution.succeeded", data: { sessionID: "sess-idle" } },
    ])
    await idleState.flushEvents()
    const logPath = join(idleState.directory, ".opencode", "flowdeck.log")
    expect(existsSync(logPath)).toBe(true)
    const content = readFileSync(logPath, "utf-8")
    expect(content).toContain('"event":"idle"')
    await idleState.dispose()
    rmSync(idleState.directory, { recursive: true, force: true })
  })

  it("writes an error entry on session.execution.failed events", async () => {
    const failedState = await loadV2Plugin([
      { type: "session.execution.failed", data: { sessionID: "sess-err" } },
    ])
    await failedState.flushEvents()
    const logPath = join(failedState.directory, ".opencode", "flowdeck.log")
    expect(existsSync(logPath)).toBe(true)
    const content = readFileSync(logPath, "utf-8")
    expect(content).toContain('"event":"error"')
    await failedState.dispose()
    rmSync(failedState.directory, { recursive: true, force: true })
  })

  it("session.execution.succeeded clears the per-session write counter", async () => {
    const { recordWrite, getWriteCount, clearWriteCounter } = await import("@/hooks/tool-guard")
    const sessionID = "sess-clear"
    recordWrite(sessionID, "/tmp/a.ts")
    recordWrite(sessionID, "/tmp/b.ts")
    expect(getWriteCount(sessionID)).toBe(2)

    const idleState = await loadV2Plugin([{ type: "session.execution.succeeded", data: { sessionID } }])
    await idleState.flushEvents()
    expect(getWriteCount(sessionID)).toBe(0)
    clearWriteCounter(sessionID)
    await idleState.dispose()
    rmSync(idleState.directory, { recursive: true, force: true })
  })
})

describe("plugin entry: toolGuardHook wiring (bug 3b)", () => {
  let dir: string
  let prevEnv: string | undefined
  let state: Awaited<ReturnType<typeof loadV2Plugin>>

  beforeEach(async () => {
    dir = makeTempDir()
    prevEnv = process.env.FLOWDECK_TOOL_GUARD_ENABLED
    process.env.FLOWDECK_TOOL_GUARD_ENABLED = "on"
    process.env.FLOWDECK_GUARD_RAILS_ENABLED = "off"
    // Provide a STATE.md so phase enforcement has something to read.
    mkdirSync(planningDir(dir), { recursive: true })
    writeFileSync(join(planningDir(dir), "STATE.md"), "phase: 1\nstatus: planned")
    state = await loadV2Plugin()
    // Point the mock context's directory at dir by re-registering? The plugin
    // captured state.directory, so guard checks read that planning dir.
    mkdirSync(planningDir(state.directory), { recursive: true })
    writeFileSync(join(planningDir(state.directory), "STATE.md"), "phase: 1\nstatus: planned")
  })

  afterEach(async () => {
    await state.dispose()
    rmSync(state.directory, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
    if (prevEnv === undefined) delete process.env.FLOWDECK_TOOL_GUARD_ENABLED
    else process.env.FLOWDECK_TOOL_GUARD_ENABLED = prevEnv
    delete process.env.FLOWDECK_GUARD_RAILS_ENABLED
  })

  it("blocks a write in discuss phase when FLOWDECK_TOOL_GUARD_ENABLED=on", async () => {
    const before = state.toolHooks["execute.before"]
    let caught: Error | null = null
    try {
      await before({ tool: "write", sessionID: "primary", agent: "build", input: { filePath: "src/x.ts" } })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBeNull()
    expect(caught!.message).toMatch(/blocked in phase 1/)
  })
})

describe("pure mapping helpers", () => {
  it("toV2Result maps plain strings", () => {
    expect(toV2Result("hello")).toEqual({ content: "hello" })
  })

  it("toV2Result maps structured output and attachments", () => {
    const result = toV2Result({
      title: "Diff",
      output: "-1 +2",
      metadata: { files: 1 },
      attachments: [{ type: "file", mime: "text/plain", url: "file:///tmp/a.txt", filename: "a.txt" }],
    })
    // `title` is not part of the v2 `Tool.Result` shape — it must be dropped.
    expect(result).not.toHaveProperty("title")
    expect(result.metadata).toEqual({ files: 1 })
    expect(result.content[0]).toEqual({ type: "text", text: "-1 +2" })
    expect(result.content[1]).toEqual({
      type: "file",
      uri: "file:///tmp/a.txt",
      mime: "text/plain",
      name: "a.txt",
    })
  })

  it("convertMcpConfig strips v1-only fields", () => {
    const remote = convertMcpConfig({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      enabled: true,
      oauth: false,
      headers: { Authorization: "Bearer x" },
    } as any)
    expect(remote).toEqual({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      headers: { Authorization: "Bearer x" },
      oauth: false,
    })

    const local = convertMcpConfig({
      type: "local",
      command: ["npx", "-y", "server"],
      enabled: true,
      environment: { KEY: "v" },
    } as any)
    expect(local).toEqual({ type: "local", command: ["npx", "-y", "server"], environment: { KEY: "v" } })
  })

  it("substituteArguments replaces $ARGUMENTS and appends when absent", () => {
    expect(substituteArguments("Do $ARGUMENTS now", "the thing")).toBe("Do the thing now")
    expect(substituteArguments("Review the plan", "extra note")).toBe("Review the plan\n\nextra note")
    expect(substituteArguments("Review the plan", "")).toBe("Review the plan")
  })

  it("parseModelRef splits provider/model[#variant]", () => {
    expect(parseModelRef("anthropic/claude-sonnet-4-5")).toEqual({
      providerID: "anthropic",
      id: "claude-sonnet-4-5",
    })
    expect(parseModelRef("openai/gpt-5#high")).toEqual({
      providerID: "openai",
      id: "gpt-5",
      variant: "high",
    })
  })

  it("parseModelRef keeps namespaced model ids after the first slash", () => {
    expect(parseModelRef("openrouter/anthropic/claude-sonnet-4.5")).toEqual({
      providerID: "openrouter",
      id: "anthropic/claude-sonnet-4.5",
    })
    expect(parseModelRef("openrouter/anthropic/claude-sonnet-4.5#high")).toEqual({
      providerID: "openrouter",
      id: "anthropic/claude-sonnet-4.5",
      variant: "high",
    })
  })

  it("parseModelRef throws a clear error on malformed references", () => {
    // The caller guards `cfg.model ?`, but the exported contract must still
    // reject malformed references with an actionable message.
    const malformed = ["/claude", "anthropic/", "anthropic", ""]
    for (const ref of malformed) {
      expect(() => parseModelRef(ref)).toThrowError(
        `invalid model reference "${ref}": expected provider/model[#variant]`,
      )
    }
  })

  it("agentEdits maps v1 config fields to v2 agent fields", () => {
    const edits = agentEdits({
      prompt: "Be brief.",
      temperature: 0.2,
      model: "anthropic/claude-sonnet-4-5",
      mode: "primary",
      description: "Orchestrates",
    })
    expect(edits.system).toBe("Be brief.")
    expect(edits.request.body.temperature).toBe(0.2)
    expect(edits.model).toEqual({ providerID: "anthropic", id: "claude-sonnet-4-5" })
    expect(edits.mode).toBe("primary")
    expect(edits.hidden).toBe(false)
    expect(edits.description).toBe("Orchestrates")
  })

  it("agentEdits defaults mode to subagent", () => {
    const edits = agentEdits({})
    expect(edits.mode).toBe("subagent")
    expect(edits.model).toBeUndefined()
    // No configured temperature → none is written (guards the v2 agent transform).
    expect(edits.request.body).toEqual({})
  })

  it("toolInputSchema produces an object JSON Schema from zod args", () => {
    const schema = toolInputSchema({
      action: z.enum(["read", "write"]),
      limit: z.number().optional(),
    })
    expect(schema.type).toBe("object")
    const properties = schema.properties as Record<string, any>
    expect(properties.action.enum).toEqual(["read", "write"])
    // `optional()` fields are not required in the input schema.
    expect(schema.required).toEqual(["action"])
  })

  it("eventSessionID reads data.sessionID defensively", () => {
    expect(eventSessionID({ data: { sessionID: "s1" } })).toBe("s1")
    expect(eventSessionID({ data: {} })).toBe("")
    expect(eventSessionID({})).toBe("")
    expect(eventSessionID({ data: { sessionID: 42 } })).toBe("")
  })

  it("FLOWDECK_TOOLS registers 25 tools", () => {
    expect(Object.keys(FLOWDECK_TOOLS)).toHaveLength(25)
  })
})