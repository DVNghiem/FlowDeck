import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { FLOWDECK_TOOLS } from "@/index"

describe("removed delegation tools", () => {
  it("run-pipeline module is gone and delegate module is also gone", () => {
    expect(existsSync(join(process.cwd(), "src/tools/run-pipeline.ts"))).toBe(false)
    expect(existsSync(join(process.cwd(), "src/tools/delegate.ts"))).toBe(false)
  })

  it("plugin tool registry does not expose a delegate tool", () => {
    // `FLOWDECK_TOOLS` is the exact set registered through `ctx.tool.transform`.
    const toolNames = Object.keys(FLOWDECK_TOOLS)
    expect(toolNames).not.toContain("delegate")
    expect(toolNames).not.toContain("run-pipeline")
  })

  it("index source does not import the delegate tool file", () => {
    const source = readFileSync(join(process.cwd(), "src/index.ts"), "utf-8")
    expect(source).not.toContain('./tools/delegate')
    expect(source).not.toContain('./tools/run-pipeline')
  })
})