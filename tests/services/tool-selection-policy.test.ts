/**
 * Tool Selection Policy Tests
 *
 * Covers:
 *  - codegraph preferred for graph-aware code understanding when available
 *  - token-optimizer preferred for token-sensitive reading when available
 *  - fallback to grep_app when codegraph is unavailable
 *  - fallback to default when nothing is available
 *  - library docs prefers context7
 *  - web research prefers websearch (exa)
 *  - code_text_search prefers grep_app
 *  - general intent returns default
 *  - shouldActivateTokenOptimization only fires when threshold met
 *  - notes include unavailability reasons for fallback diagnostics
 */

import { describe, it, expect } from "vitest"
import {
  selectToolFamily,
  shouldActivateTokenOptimization,
  type SelectionInput,
} from "@/services/tool-selection-policy"
import type { McpAvailability, McpName } from "@/mcp/index"

function avail(entries: Array<[McpName, boolean, string?]>): McpAvailability[] {
  return entries.map(([name, available, reason]) => ({
    name,
    available,
    enabled: true,
    type: "local",
    ...(reason !== undefined ? { unavailableReason: reason } : {}),
  }))
}

const empty: McpAvailability[] = []
const allAvail: McpAvailability[] = avail([
  ["codegraph", true],
  ["tokenOptimizer", true],
  ["websearch", true],
  ["grep_app", true],
  ["context7", true],
  ["memory", true],
  ["sequentialThinking", true],
  ["magic", true],
  ["playwright", true],
])

describe("selectToolFamily: code_graph_understanding", () => {
  it("prefers codegraph when available and ready", () => {
    const result = selectToolFamily({
      intent: "code_graph_understanding",
      availability: allAvail,
      codegraphReady: true,
    })
    expect(result.primary.family).toBe("codegraph")
    expect(result.primary.mcp).toBe("codegraph")
    expect(result.primary.preferred).toBe(true)
  })

  it("falls back to grep_app when codegraph is unavailable", () => {
    const result = selectToolFamily({
      intent: "code_graph_understanding",
      availability: avail([
        ["codegraph", false, "codegraph not installed"],
        ["grep_app", true],
      ]),
      codegraphReady: false,
    })
    expect(result.primary.family).toBe("code_text_search")
    expect(result.primary.mcp).toBe("grep_app")
    expect(result.notes.some(n => n.includes("codegraph"))).toBe(true)
  })

  it("falls back to default when no specialized tool is available", () => {
    const result = selectToolFamily({
      intent: "code_graph_understanding",
      availability: avail([
        ["codegraph", false, "not installed"],
        ["grep_app", false, "npx missing"],
      ]),
    })
    expect(result.primary.family).toBe("default")
    expect(result.primary.mcp).toBeNull()
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it("never auto-disables a fallback when preferred is available", () => {
    const result = selectToolFamily({
      intent: "code_graph_understanding",
      availability: allAvail,
      codegraphReady: true,
    })
    // primary is codegraph; fallbacks chain includes grep_app
    expect(result.fallbacks.map(f => f.family)).toContain("code_text_search")
  })
})

describe("selectToolFamily: token_sensitive_reading", () => {
  it("prefers token-optimizer when available and intent is token-sensitive", () => {
    const result = selectToolFamily({
      intent: "token_sensitive_reading",
      availability: allAvail,
      tokenSensitive: true,
    })
    expect(result.primary.family).toBe("token-optimizer")
    expect(result.primary.mcp).toBe("tokenOptimizer")
    expect(result.primary.preferred).toBe(true)
  })

  it("falls back to default when token-optimizer is unavailable", () => {
    const result = selectToolFamily({
      intent: "token_sensitive_reading",
      availability: avail([
        ["tokenOptimizer", false, "npx missing"],
      ]),
      tokenSensitive: true,
    })
    expect(result.primary.family).toBe("default")
    expect(result.primary.reason).toMatch(/token-sensitive/)
  })

  it("returns default when not token-sensitive even if token-optimizer is available", () => {
    const result = selectToolFamily({
      intent: "token_sensitive_reading",
      availability: allAvail,
      tokenSensitive: false,
    })
    expect(result.primary.family).toBe("default")
    expect(result.primary.preferred).toBe(false)
  })
})

describe("selectToolFamily: web_research", () => {
  it("prefers websearch (exa) when available", () => {
    const result = selectToolFamily({
      intent: "web_research",
      availability: allAvail,
    })
    expect(result.primary.family).toBe("websearch")
    expect(result.primary.mcp).toBe("websearch")
  })

  it("falls back to grep_app when websearch is unavailable", () => {
    const result = selectToolFamily({
      intent: "web_research",
      availability: avail([
        ["websearch", false, "no exa key"],
        ["grep_app", true],
      ]),
    })
    expect(result.primary.family).toBe("code_text_search")
    expect(result.primary.mcp).toBe("grep_app")
  })

  it("falls back to default when nothing is available", () => {
    const result = selectToolFamily({
      intent: "web_research",
      availability: avail([
        ["websearch", false, "disabled"],
        ["grep_app", false, "disabled"],
      ]),
    })
    expect(result.primary.family).toBe("default")
  })

  it("places context7 in the chain after grep_app when websearch is unavailable", () => {
    const result = selectToolFamily({
      intent: "web_research",
      availability: avail([
        ["websearch", false, "no exa key"],
        ["grep_app", true],
        ["context7", true],
      ]),
    })
    expect(result.primary.family).toBe("code_text_search")
    expect(result.primary.mcp).toBe("grep_app")
    // The documented fallback chain is grep_app → context7 → default, so
    // context7 must be present in the chain (as a fallback) even though
    // grep_app is preferred.
    expect(result.fallbacks.map((f) => f.family)).toContain("library_docs")
    expect(result.chain.map((f) => f.family)).toContain("library_docs")
  })

  it("prefers context7 as the primary research tool when only context7 is available", () => {
    const result = selectToolFamily({
      intent: "web_research",
      availability: avail([
        ["websearch", false, "no exa key"],
        ["grep_app", false, "npx missing"],
        ["context7", true],
      ]),
    })
    expect(result.primary.family).toBe("library_docs")
    expect(result.primary.mcp).toBe("context7")
  })
})

describe("selectToolFamily: library_docs", () => {
  it("prefers context7 when available", () => {
    const result = selectToolFamily({
      intent: "library_docs",
      availability: allAvail,
    })
    expect(result.primary.family).toBe("library_docs")
    expect(result.primary.mcp).toBe("context7")
  })

  it("falls back to default when context7 is unavailable", () => {
    const result = selectToolFamily({
      intent: "library_docs",
      availability: avail([["context7", false, "disabled"]]),
    })
    expect(result.primary.family).toBe("default")
    expect(result.primary.preferred).toBe(false)
  })
})

describe("selectToolFamily: code_text_search", () => {
  it("prefers grep_app when available", () => {
    const result = selectToolFamily({
      intent: "code_text_search",
      availability: allAvail,
    })
    expect(result.primary.family).toBe("code_text_search")
    expect(result.primary.mcp).toBe("grep_app")
  })

  it("falls back to default when grep_app is unavailable", () => {
    const result = selectToolFamily({
      intent: "code_text_search",
      availability: empty,
    })
    expect(result.primary.family).toBe("default")
  })
})

describe("selectToolFamily: general", () => {
  it("returns default for general intent", () => {
    const result = selectToolFamily({
      intent: "general",
      availability: allAvail,
    })
    expect(result.primary.family).toBe("default")
    expect(result.primary.preferred).toBe(false)
  })
})

describe("shouldActivateTokenOptimization", () => {
  it("returns null when token-optimizer is not available", () => {
    const result = shouldActivateTokenOptimization(50_000, 20_000, empty)
    expect(result).toBeNull()
  })

  it("returns null when estimated tokens are below the threshold", () => {
    const result = shouldActivateTokenOptimization(5_000, 20_000, allAvail)
    expect(result).toBeNull()
  })

  it("activates token-optimizer when tokens >= threshold and tool is available", () => {
    const result = shouldActivateTokenOptimization(50_000, 20_000, allAvail)
    expect(result).not.toBeNull()
    expect(result!.family).toBe("token-optimizer")
    expect(result!.preferred).toBe(true)
  })
})

describe("selectToolFamily: empty availability", () => {
  it("returns default for every intent when nothing is available", () => {
    const intents: SelectionInput["intent"][] = [
      "code_graph_understanding",
      "token_sensitive_reading",
      "web_research",
      "library_docs",
      "code_text_search",
      "general",
    ]
    for (const intent of intents) {
      const result = selectToolFamily({ intent, availability: empty })
      expect(result.primary.family).toBe("default")
      expect(result.primary.mcp).toBeNull()
    }
  })
})
