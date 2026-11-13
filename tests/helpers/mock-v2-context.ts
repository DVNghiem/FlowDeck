/**
 * Mock OpenCode v2 plugin context for unit tests.
 *
 * Mimics the registry semantics of `ctx.<domain>.transform` editors: updates
 * apply to existing entries or create them (matching AgentEditor.update), and
 * captured registrations are readable after `setup` completes.
 */
import { tmpdir } from "os"
import { mkdtempSync } from "fs"
import { join } from "path"

export interface MockV2State {
  tools: Map<string, any>
  toolHooks: Record<string, (event: any) => Promise<void> | void>
  agents: Map<string, any>
  defaultAgent: string | undefined
  mcps: Map<string, unknown>
  commands: Map<string, any>
  skills: any[]
  sessionHooks: Record<string, (event: any) => Promise<void> | void>
  sessionPrompts: Array<Record<string, unknown>>
  events: unknown[]
  directory: string
  /** Runs the plugin's cleanup function (event stream abort). */
  dispose: () => Promise<void>
  /** Wait for the plugin's event subscription loop to drain. */
  flushEvents: () => Promise<void>
}

export async function loadV2Plugin(events: unknown[] = []): Promise<MockV2State> {
  const directory = mkdtempSync(join(tmpdir(), "flowdeck-v2-test-"))
  const state = {
    tools: new Map<string, any>(),
    toolHooks: {} as Record<string, (event: any) => Promise<void> | void>,
    agents: new Map<string, any>(),
    defaultAgent: undefined as string | undefined,
    mcps: new Map<string, unknown>(),
    commands: new Map<string, any>(),
    skills: [] as any[],
    sessionHooks: {} as Record<string, (event: any) => Promise<void> | void>,
    sessionPrompts: [] as Array<Record<string, unknown>>,
    events: [...events],
    directory,
    dispose: async () => {},
    flushEvents: () => new Promise<void>((resolve) => setTimeout(resolve, 30)),
  }

  const registration = { dispose: async () => {} }

  const agentEditor = () => ({
    list: () => [...state.agents.values()],
    get: (id: string) => state.agents.get(id),
    default: (id: string | undefined) => {
      state.defaultAgent = id
    },
    update: (id: string, fn: (agent: any) => void) => {
      const existing = state.agents.get(id)
      const agent = existing ?? {
        id,
        name: id,
        mode: "primary",
        hidden: false,
        permissions: [],
        request: { settings: {}, headers: {}, body: {} },
      }
      fn(agent)
      state.agents.set(id, agent)
    },
    remove: (id: string) => {
      state.agents.delete(id)
    },
  })

  const ctx: any = {
    app: { name: "opencode", version: "test", channel: "test" },
    location: {
      directory,
      workspaceID: "default",
      project: { id: "test-project", directory, canonical: directory },
    },
    options: {},
    agent: {
      transform: async (cb: (editor: any) => void) => {
        cb(agentEditor())
        return registration
      },
      reload: async () => {},
      list: async () => [...state.agents.values()],
      get: async (input: any) => state.agents.get(input?.agentID),
    },
    mcp: {
      transform: async (cb: (editor: any) => void) => {
        cb({
          list: () => [...state.mcps.entries()],
          get: (name: string) => state.mcps.get(name),
          set: (name: string, config: unknown) => {
            state.mcps.set(name, config)
          },
          update: (name: string, fn: (config: any) => void) => fn(state.mcps.get(name)),
          remove: (name: string) => {
            state.mcps.delete(name)
          },
        })
        return registration
      },
      reload: async () => {},
      list: async () => [...state.mcps.entries()],
    },
    command: {
      transform: async (cb: (editor: any) => void) => {
        cb({ add: (definition: any) => state.commands.set(definition.name, definition) })
        return registration
      },
      reload: async () => {},
      list: async () => [...state.commands.values()],
    },
    skill: {
      transform: async (cb: (editor: any) => void) => {
        cb({
          list: () => [...state.skills],
          get: (id: string) => state.skills.find((s) => s.id === id),
          add: (skill: any) => {
            state.skills.push(skill)
          },
          update: (id: string, fn: (skill: any) => void) => fn(state.skills.find((s) => s.id === id)),
          remove: (id: string) => {
            const index = state.skills.findIndex((s) => s.id === id)
            if (index >= 0) state.skills.splice(index, 1)
          },
        })
        return registration
      },
      reload: async () => {},
      list: async () => [...state.skills],
    },
    session: {
      hook: async (name: string, cb: any) => {
        state.sessionHooks[name] = cb
        return registration
      },
      prompt: async (input: Record<string, unknown>) => {
        state.sessionPrompts.push(input)
      },
    },
    tool: {
      transform: async (cb: (editor: any) => void) => {
        cb({
          list: () => [...state.tools.values()],
          get: (id: string) => state.tools.get(id),
          namespace: () => {},
          add: (tool: any) => {
            state.tools.set(tool.name, tool)
          },
          update: (id: string, fn: (tool: any) => void) => {
            const tool = state.tools.get(id)
            if (tool) fn(tool)
          },
          remove: (id: string) => {
            state.tools.delete(id)
          },
        })
        return registration
      },
      hook: async (name: string, cb: any) => {
        state.toolHooks[name] = cb
        return registration
      },
      reload: async () => {},
      list: async () => [...state.tools.values()],
    },
    event: {
      subscribe: () =>
        (async function* () {
          for (const event of state.events) {
            yield event
          }
        })(),
    },
  }

  const { default: plugin } = await import("@/index")
  const cleanup = await plugin.setup(ctx)
  state.dispose = async () => {
    if (typeof cleanup === "function") await cleanup()
  }

  return state
}