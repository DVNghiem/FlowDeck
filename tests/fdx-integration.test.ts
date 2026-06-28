/**
 * FDX Integration Bug Fixes Tests
 *
 * Covers 4 bugs from post-fdx integration:
 * 1. fdxBin() called at module load time — should be lazy per call
 * 2. devops agent missing fdx instructions in prompt
 * 3. fd-resume unaware of ultrawork state
 * 4. fd-ultrawork and fd-init-deep present in registry/routing
 */

import { describe, it, expect } from "vitest"
import { REGISTERED_COMMANDS } from "@/services/supervisor-binding"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const SRC_DIR = resolve(import.meta.dirname, "../src")

function readSrc(path: string): string {
  return readFileSync(resolve(SRC_DIR, path), "utf-8")
}

// ─── Bug 1: fdxBin() called at module load time ───────────────────────────────

describe("fdx.ts — lazy binary resolution", () => {
  it("does NOT call fdxBin() at module level", () => {
    const content = readSrc("tools/fdx.ts")
    // The bug: const FDX_BINARY = fdxBin() at module load time
    expect(content).not.toMatch(/const\s+FDX_BINARY\s*=\s*fdxBin\(\)/)
  })

  it("calls fdxBin() inside runFdx() for lazy resolution", () => {
    const content = readSrc("tools/fdx.ts")
    // runFdx should resolve the binary lazily
    expect(content).toMatch(/function\s+runFdx\s*\(/)
    // fdxBin should be called within runFdx body — extract body by finding the function
    const runFdxIndex = content.indexOf("function runFdx")
    expect(runFdxIndex).toBeGreaterThan(-1)
    // Find the opening brace and extract until the matching closing brace
    const openBrace = content.indexOf("{", runFdxIndex)
    expect(openBrace).toBeGreaterThan(-1)
    let depth = 1
    let closeBrace = openBrace + 1
    while (depth > 0 && closeBrace < content.length) {
      if (content[closeBrace] === "{") depth++
      else if (content[closeBrace] === "}") depth--
      closeBrace++
    }
    const runFdxBody = content.slice(openBrace + 1, closeBrace - 1)
    expect(runFdxBody).toMatch(/fdxBin\(\)/)
  })

  it("has no module-level const FDX_BINARY declaration", () => {
    const content = readSrc("tools/fdx.ts")
    const lines = content.split("\n")
    for (const line of lines) {
      // Allow comments mentioning it, but not actual declarations
      const trimmed = line.trim()
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue
      expect(trimmed).not.toMatch(/^const\s+FDX_BINARY\s*=/)
    }
  })
})

// ─── Bug 2: devops agent missing fdx instructions ─────────────────────────────

describe("devops agent — fdx preferred tools", () => {
  it("includes fdx-git in preferred tools", () => {
    const content = readSrc("agents/coder.ts")
    expect(content).toMatch(/fdx-git/)
  })

  it("includes fdx-lint in preferred tools", () => {
    const content = readSrc("agents/coder.ts")
    expect(content).toMatch(/fdx-lint/)
  })

  it("includes fdx-tree in preferred tools", () => {
    const content = readSrc("agents/coder.ts")
    expect(content).toMatch(/fdx-tree/)
  })

  it("includes fdx-test in preferred tools", () => {
    const content = readSrc("agents/coder.ts")
    expect(content).toMatch(/fdx-test/)
  })

  it("has a dedicated ## Preferred Tools section in DEVOPS_PROMPT", () => {
    const content = readSrc("agents/coder.ts")
    const devopsSection = content.match(/DEVOPS_PROMPT\s*=\s*`([\s\S]*?)`;/)
    expect(devopsSection).toBeTruthy()
    const prompt = devopsSection?.[1] ?? ""
    expect(prompt).toMatch(/##\s+Preferred\s+Tools/i)
  })
})

// ─── Bug 3: fd-resume unaware of ultrawork state ──────────────────────────────

describe("fd-resume.md — ultrawork state awareness", () => {
  it("mentions .planning/ultrawork/STATE.md", () => {
    const content = readSrc("commands/fd-resume.md")
    expect(content).toMatch(/\.planning\/ultrawork\/STATE\.md/)
  })

  it("checks ultrawork state before standard STATE.md", () => {
    const content = readSrc("commands/fd-resume.md")
    const ultraworkIndex = content.indexOf(".planning/ultrawork/STATE.md")
    const standardIndex = content.indexOf(".planning/STATE.md")
    expect(ultraworkIndex).toBeGreaterThan(-1)
    expect(standardIndex).toBeGreaterThan(-1)
    expect(ultraworkIndex).toBeLessThan(standardIndex)
  })

  it("mentions resuming fd-ultrawork from recorded phase", () => {
    const content = readSrc("commands/fd-resume.md")
    expect(content).toMatch(/fd-ultrawork|ultrawork/)
  })

  it("reads iteration, status, plan_file from ultrawork STATE", () => {
    const content = readSrc("commands/fd-resume.md")
    expect(content).toMatch(/iteration/)
    expect(content).toMatch(/status/)
    expect(content).toMatch(/plan_file/)
  })
})

// ─── Bug 4: fd-ultrawork and fd-init-deep in registry ─────────────────────────

describe("supervisor-binding — registered commands", () => {
  it("includes fd-ultrawork in REGISTERED_COMMANDS", () => {
    expect(REGISTERED_COMMANDS).toContain("fd-ultrawork")
  })
})

describe("fd-quick.md — workflow table includes fd-ultrawork", () => {
  it("mentions fd-ultrawork in the workflow table", () => {
    const content = readSrc("commands/fd-quick.md")
    expect(content).toMatch(/fd-ultrawork/)
  })

  it("describes fd-ultrawork as maximum-effort execution", () => {
    const content = readSrc("commands/fd-quick.md")
    expect(content).toMatch(/maximum-effort|deep research|perfection loop/i)
  })
})
