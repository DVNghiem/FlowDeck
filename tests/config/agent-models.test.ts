/**
 * Agent Models Configuration Tests
 *
 * Covers:
 * - loadFlowDeckConfig finds .flowdeck.jsonc with comments
 * - loadFlowDeckConfig falls back through candidate paths in correct order
 * - Malformed config files are silently ignored
 * - Missing config returns default empty config
 * - resolveAgentModels merges agentModels and legacy agents keys
 * - parseModelSpec converts provider/model strings to SDK model shape
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  loadFlowDeckConfig,
  resolveAgentModels,
  parseModelSpec,
  DEFAULT_CONFIG,
} from "@/config/agent-models"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "flowdeck-agent-models-test-"))
}

describe("loadFlowDeckConfig", () => {
  let dir: string

  beforeEach(() => { dir = makeTempDir() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("loads .flowdeck.jsonc with line and block comments", () => {
    writeFileSync(
      join(dir, ".flowdeck.jsonc"),
      `{
        // agent model assignments
        "agentModels": {
          "planner": { "model": "anthropic/claude-opus-4-6" }
        },
        /* ultrawork mode */
        "ultrawork": true
      }`,
      "utf-8",
    )

    const cfg = loadFlowDeckConfig(dir)
    expect(cfg.agentModels?.planner?.model).toBe("anthropic/claude-opus-4-6")
    expect(cfg.ultrawork).toBe(true)
  })

  it("prefers .flowdeck.jsonc over .flowdeck.json", () => {
    writeFileSync(join(dir, ".flowdeck.json"), JSON.stringify({ ultrawork: false }), "utf-8")
    writeFileSync(join(dir, ".flowdeck.jsonc"), JSON.stringify({ ultrawork: true }), "utf-8")

    const cfg = loadFlowDeckConfig(dir)
    expect(cfg.ultrawork).toBe(true)
  })

  it("prefers project .flowdeck.json over .opencode/flowdeck.jsonc", () => {
    mkdirSync(join(dir, ".opencode"), { recursive: true })
    writeFileSync(join(dir, ".opencode", "flowdeck.jsonc"), JSON.stringify({ maxDelegationDepth: 7 }), "utf-8")
    writeFileSync(join(dir, ".flowdeck.json"), JSON.stringify({ maxDelegationDepth: 3 }), "utf-8")

    const cfg = loadFlowDeckConfig(dir)
    expect(cfg.maxDelegationDepth).toBe(3)
  })

  it("reads .opencode/flowdeck.jsonc when no .flowdeck.* exists", () => {
    mkdirSync(join(dir, ".opencode"), { recursive: true })
    writeFileSync(
      join(dir, ".opencode", "flowdeck.jsonc"),
      `{ "agentModels": { "tester": { "model": "openai/gpt-4o" } } }`,
      "utf-8",
    )

    const cfg = loadFlowDeckConfig(dir)
    expect(cfg.agentModels?.tester?.model).toBe("openai/gpt-4o")
  })

  it("returns default config when no config file exists", () => {
    const cfg = loadFlowDeckConfig(dir)
    expect(cfg).toEqual(DEFAULT_CONFIG)
  })

  it("silently ignores malformed JSON/JSONC and continues searching", () => {
    mkdirSync(join(dir, ".opencode"), { recursive: true })
    writeFileSync(join(dir, ".flowdeck.jsonc"), "{not valid", "utf-8")
    writeFileSync(join(dir, ".opencode", "flowdeck.json"), JSON.stringify({ ultrawork: true }), "utf-8")

    const cfg = loadFlowDeckConfig(dir)
    expect(cfg.ultrawork).toBe(true)
  })

  it("does not corrupt strings containing comment-like sequences", () => {
    writeFileSync(
      join(dir, ".flowdeck.jsonc"),
      `{ "agentModels": { "planner": { "model": "provider/ model // with /* comment */" } } }`,
      "utf-8",
    )

    const cfg = loadFlowDeckConfig(dir)
    expect(cfg.agentModels?.planner?.model).toBe("provider/ model // with /* comment */")
  })
})

describe("resolveAgentModels", () => {
  it("returns empty record when no config", () => {
    expect(resolveAgentModels({})).toEqual({})
  })

  it("merges agentModels and legacy agents with agentModels winning", () => {
    const cfg = {
      agentModels: { planner: { model: "a" } },
      agents: { planner: { model: "b" }, tester: { model: "c" } },
    }
    const models = resolveAgentModels(cfg)
    expect(models.planner).toBe("a")
    expect(models.tester).toBe("c")
  })

  it("ignores entries without a model", () => {
    const cfg = { agentModels: { planner: { temperature: 0.5 } } }
    expect(resolveAgentModels(cfg)).toEqual({})
  })
})

describe("parseModelSpec", () => {
  it("splits provider/model into providerID and modelID", () => {
    expect(parseModelSpec("anthropic/claude-opus-4")).toEqual({
      providerID: "anthropic",
      modelID: "claude-opus-4",
    })
  })

  it("returns undefined for empty or invalid spec", () => {
    expect(parseModelSpec("")).toBeUndefined()
    expect(parseModelSpec("noseparator")).toBeUndefined()
  })
})
