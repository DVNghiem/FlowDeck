import { describe, expect, it, vi } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

describe("removed delegation tools", () => {
  it("delegate and run-pipeline modules are gone", async () => {
    expect(existsSync(join(process.cwd(), "src/tools/delegate.ts"))).toBe(false)
    expect(existsSync(join(process.cwd(), "src/tools/run-pipeline.ts"))).toBe(false)

    const importDelegate = () => import(`@/tools/${"delegate"}`)
    const importRunPipeline = () => import(`@/tools/${"run-pipeline"}`)

    await expect(importDelegate()).rejects.toThrow()
    await expect(importRunPipeline()).rejects.toThrow()
  })

  it("plugin tool registry does not expose removed tools", async () => {
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

  it("index source no longer imports deleted tool files", () => {
    const source = readFileSync(join(process.cwd(), "src/index.ts"), "utf-8")
    expect(source).not.toContain('./tools/delegate')
    expect(source).not.toContain('./tools/run-pipeline')
  })
})
