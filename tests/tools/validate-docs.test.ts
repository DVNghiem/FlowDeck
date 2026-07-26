import { describe, it, expect } from "vitest"
import { spawnSync } from "child_process"
import { join } from "path"

const SCRIPT = join(process.cwd(), "scripts", "validate-docs.mjs")
const FIXTURES = join(process.cwd(), "tests", "tools", "__fixtures__", "validate-docs")

function runValidator(name: string) {
  return spawnSync("node", [SCRIPT, `--root=${join(FIXTURES, name)}`], {
    encoding: "utf-8",
  })
}

describe("validate-docs.mjs", () => {
  it("ok: passes on a clean fixture", () => {
    const result = runValidator("ok")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Docs validation passed.")
  })

  it("bad-count: fails when README declares a wrong agent count", () => {
    const result = runValidator("bad-count")
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("declares 99 agents but src/agents has 3")
  })

  it("bad-link: fails when README has a broken relative link", () => {
    const result = runValidator("bad-link")
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("broken relative link docs/does-not-exist.md")
  })

  it("bad-state-path: fails when a docs file references a missing command", () => {
    const result = runValidator("bad-state-path")
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("references missing command /fd-ghost")
  })

  it("bad-parity: fails on command-directory parity mismatch", () => {
    const result = runValidator("bad-parity")
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("command-directory parity mismatch")
  })

  it("bad-version: fails with VERSION X but package.json.version is Y when versions differ", () => {
    const result = runValidator("bad-version")
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("VERSION is 9.9.9 but package.json.version is 1.0.0")
  })
})
