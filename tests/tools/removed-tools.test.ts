import { describe, expect, it, vi } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

describe("removed delegation tools", () => {
  it("run-pipeline module is gone and delegate module is also gone", () => {
    expect(existsSync(join(process.cwd(), "src/tools/run-pipeline.ts"))).toBe(false)
    expect(existsSync(join(process.cwd(), "src/tools/delegate.ts"))).toBe(false)
  })

  it("plugin tool registry does not expose a delegate tool", async () => {
    const { default: plugin } = await import("@/index")
    const mockClient: any = {
      app: { log: vi.fn().mockResolvedValue(undefined) },
      session: {
        create: vi.fn(),
        prompt: vi.fn(),
        abort: vi.fn(),
      },
    }

    const result = await plugin({
      directory: process.cwd(),
      client: mockClient,
      worktree: "",
      project: {},
      experimental_workspace: { register: () => {} },
      serverUrl: new URL("http://localhost"),
      $: {},
    } as any, {})

    const toolNames = Object.keys((result as any).tool ?? {})
    expect(toolNames).not.toContain("delegate")
    expect(toolNames).not.toContain("run-pipeline")
  })

  it("index source does not import the delegate tool file", () => {
    const source = readFileSync(join(process.cwd(), "src/index.ts"), "utf-8")
    expect(source).not.toContain('./tools/delegate')
    expect(source).not.toContain('./tools/run-pipeline')
  })
})
