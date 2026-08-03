import { describe, it, expect, vi, beforeEach } from "vitest"
import { fdxRewriteHook, rewrite } from "@/hooks/fdx-rewrite"
import * as sessionStartModule from "@/hooks/session-start"

describe("rewrite (pure function)", () => {
  describe("cat / head / tail → fdx-read", () => {
    it("rewrites cat", () => {
      expect(rewrite("cat src/index.ts")).toBe("fdx-read --mode auto src/index.ts")
    })
    it("rewrites head", () => {
      expect(rewrite("head -20 src/main.ts")).toBe("fdx-read --mode auto -20 src/main.ts")
    })
    it("rewrites tail", () => {
      expect(rewrite("tail src/log.txt")).toBe("fdx-read --mode auto src/log.txt")
    })
    it("trims whitespace", () => {
      expect(rewrite("  cat src/index.ts  ")).toBe("fdx-read --mode auto src/index.ts")
    })
  })

  describe("grep → fdx-grep", () => {
    it("rewrites simple grep", () => {
      expect(rewrite("grep 'TODO' src/")).toBe("fdx-grep 'TODO' src/")
    })
    it("rewrites grep -r", () => {
      expect(rewrite("grep -r 'ERROR' .")).toBe("fdx-grep 'ERROR' .")
    })
    it("rewrites grep -rn (strips non-r flags; fdx-grep does not need them)", () => {
      expect(rewrite("grep -rn 'FIXME' src/")).toBe("fdx-grep 'FIXME' src/")
    })
  })

  describe("find → fdx-ls / fdx-tree", () => {
    it("rewrites find with -name to fdx-ls", () => {
      expect(rewrite("find src/ -name '*.ts'")).toBe("fdx-ls src/")
    })
    it("rewrites find with -name and -type f", () => {
      expect(rewrite("find . -name '*.json' -type f")).toBe("fdx-ls .")
    })
    it("rewrites bare find to fdx-tree", () => {
      expect(rewrite("find src/")).toBe("fdx-tree src/")
    })
  })

  describe("unknown commands pass through unchanged", () => {
    it("leaves rm unchanged", () => {
      expect(rewrite("rm -rf /tmp/foo")).toBe("rm -rf /tmp/foo")
    })
    it("leaves npm install unchanged", () => {
      expect(rewrite("npm install")).toBe("npm install")
    })
    it("leaves empty command unchanged", () => {
      expect(rewrite("")).toBe("")
    })
    it("leaves cd unchanged", () => {
      expect(rewrite("cd src")).toBe("cd src")
    })
  })
})

describe("fdxRewriteHook", () => {
  beforeEach(() => {
    vi.spyOn(sessionStartModule, "isFdxAvailable").mockReturnValue(true)
  })

  it("leaves non-bash tools untouched", () => {
    const input = { tool: "grep" }
    const output = { args: { pattern: "foo", path: "src" } }
    fdxRewriteHook(input, output)
    expect(output.args).toEqual({ pattern: "foo", path: "src" })
  })

  it("leaves read tool untouched", () => {
    const input = { tool: "read" }
    const output = { args: { filePath: "src/index.ts" } }
    fdxRewriteHook(input, output)
    expect(output.args).toEqual({ filePath: "src/index.ts" })
  })

  it("rewrites cat to fdx-read when fdx is available", () => {
    const output = { args: { command: "cat src/index.ts" } }
    fdxRewriteHook({ tool: "bash" }, output)
    expect(output.args.command).toBe("fdx-read --mode auto src/index.ts")
  })

  it("leaves command unchanged when fdx is unavailable", () => {
    vi.spyOn(sessionStartModule, "isFdxAvailable").mockReturnValue(false)
    const output = { args: { command: "cat src/index.ts" } }
    fdxRewriteHook({ tool: "bash" }, output)
    expect(output.args.command).toBe("cat src/index.ts")
  })

  it("does not throw when args is missing", () => {
    expect(() => fdxRewriteHook({ tool: "bash" }, {})).not.toThrow()
  })

  it("does not throw when command is missing", () => {
    expect(() => fdxRewriteHook({ tool: "bash" }, { args: {} })).not.toThrow()
  })
})
