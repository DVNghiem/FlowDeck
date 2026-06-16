/**
 * Tool Selection Policy
 *
 * Decides which tool family to use for a given task intent, given the
 * currently-available MCPs and runtime readiness signals.
 *
 * Policy:
 *  - Graph-aware code understanding → prefer codegraph tools when available
 *    and ready (indexed + fresh). Fall back to default read/grep tools.
 *  - Token-sensitive reading (large file, big plan, many docs) → prefer
 *    token-optimizer tools when available. Fall back to default read.
 *  - Web research → prefer websearch (exa) when available, else grep_app,
 *    else context7 as a last resort. Fall back to default read.
 *  - Library docs lookup → prefer context7 when available, else default read.
 *  - Everything else → default tools (read/grep/etc.).
 *
 * The policy never auto-disables a fallback: if a preferred tool is
 * unavailable, the caller still gets a valid "default" choice. This keeps
 * FlowDeck working in environments without specialized MCPs installed.
 */

import type { McpAvailability, McpName } from "../mcp/index"

export type TaskIntent =
  | "code_graph_understanding"   // tracing callers/callees, impact, symbol search
  | "token_sensitive_reading"    // large file, big plan, many docs
  | "web_research"               // open-ended web search
  | "library_docs"               // specific library API lookup
  | "code_text_search"           // simple pattern/regex search
  | "general"                    // anything else

export interface ToolFamily {
  /** Stable identifier of the tool family ("codegraph", "token-optimizer", "default"). */
  family: string
  /** MCP name that backs this family, or null when no MCP is used. */
  mcp: McpName | null
  /** True when the family is the policy's preferred choice for this intent. */
  preferred: boolean
  /** When preferred=false, the MCP that was preferred but unavailable. */
  preferredButUnavailable?: McpName
  /** Why the policy selected this family (or fell back). */
  reason: string
}

export interface SelectionInput {
  intent: TaskIntent
  /** Whether token-sensitive reading is needed (default: false). */
  tokenSensitive?: boolean
  /** Whether code-graph readiness signals are present. */
  codegraphReady?: boolean
  /** Per-MCP availability from the MCP layer. */
  availability: McpAvailability[]
}

export interface SelectionOutput {
  primary: ToolFamily
  fallbacks: ToolFamily[]
  /** All tool families that could apply, in priority order. */
  chain: ToolFamily[]
  /** Per-MCP unavailability notes included in the output. */
  notes: string[]
}

function findAvailability(
  availability: McpAvailability[],
  name: McpName,
): McpAvailability | undefined {
  return availability.find(a => a.name === name)
}

function defaultFamily(reason: string): ToolFamily {
  return { family: "default", mcp: null, preferred: false, reason }
}

function mcpFamily(
  family: string,
  mcp: McpName,
  preferred: boolean,
  reason: string,
  preferredButUnavailable?: McpName,
): ToolFamily {
  const f: ToolFamily = { family, mcp, preferred, reason }
  if (preferredButUnavailable !== undefined) f.preferredButUnavailable = preferredButUnavailable
  return f
}

/**
 * Select the tool family for a given task intent.
 *
 * This is a pure function over availability metadata. Callers pass the
 * availability list they get from the MCP layer at startup; the policy
 * never inspects the environment itself.
 */
export function selectToolFamily(input: SelectionInput): SelectionOutput {
  const { intent, availability, tokenSensitive = false, codegraphReady = false } = input
  const notes: string[] = []
  const chain: ToolFamily[] = []
  const fallbacks: ToolFamily[] = []

  const codegraph = findAvailability(availability, "codegraph")
  const tokenOpt = findAvailability(availability, "tokenOptimizer")
  const websearch = findAvailability(availability, "websearch")
  const grepApp = findAvailability(availability, "grep_app")
  const context7 = findAvailability(availability, "context7")

  // Track unavailable preferred MCPs so callers can log why we fell back.
  const recordUnavailable = (avail: McpAvailability | undefined, name: McpName): boolean => {
    if (!avail) return false
    if (avail.available) return true
    notes.push(`${name}: ${avail.unavailableReason ?? "unavailable"}`)
    return false
  }

  switch (intent) {
    case "code_graph_understanding": {
      // Preferred: codegraph. Fallback: grep_app (search), then default.
      if (codegraph && codegraph.available && codegraphReady) {
        const primary = mcpFamily("codegraph", "codegraph", true, "codegraph available and indexed/fresh")
        chain.push(primary)
        if (grepApp?.available) chain.push(mcpFamily("code_text_search", "grep_app", false, "fallback search when codegraph is preferred"))
        chain.push(defaultFamily("read/grep when no specialized tool is available"))
        return { primary, fallbacks: chain.slice(1), chain, notes }
      }
      if (codegraph && !codegraph.available) {
        recordUnavailable(codegraph, "codegraph")
        if (grepApp?.available) {
          const primary = mcpFamily("code_text_search", "grep_app", true, "grep_app: codegraph unavailable, prefer pattern search")
          chain.push(primary)
          const fb = defaultFamily("read/grep when grep_app is not available")
          chain.push(fb)
          return { primary, fallbacks: [fb], chain, notes }
        }
        const primary = defaultFamily("codegraph preferred but unavailable; no other specialized tool")
        chain.push(primary)
        return { primary, fallbacks: [], chain, notes }
      }
      // codegraph not present at all (env-disabled) — codegraphReady is moot
      if (codegraph && !recordUnavailable(codegraph, "codegraph")) {
        // unreachable, but keeps type narrowing honest
      }
      if (codegraph?.enabled === false) {
        notes.push("codegraph: disabled via FLOWDECK_DISABLE_MCP")
      }
      if (grepApp?.available) {
        const primary = mcpFamily("code_text_search", "grep_app", true, "grep_app: codegraph not registered, prefer pattern search")
        chain.push(primary)
        const fb = defaultFamily("read/grep when grep_app is not available")
        chain.push(fb)
        return { primary, fallbacks: [fb], chain, notes }
      }
      const primary = defaultFamily("codegraph preferred but unavailable; no other specialized tool")
      chain.push(primary)
      return { primary, fallbacks: [], chain, notes }
    }

    case "token_sensitive_reading": {
      // Preferred: token-optimizer. Fallback: default read.
      if (tokenSensitive && tokenOpt?.available) {
        const primary = mcpFamily("token-optimizer", "tokenOptimizer", true, "token-sensitive reading and token-optimizer is available")
        chain.push(primary)
        const fb = defaultFamily("read when token-optimizer not available")
        chain.push(fb)
        return { primary, fallbacks: [fb], chain, notes }
      }
      if (tokenOpt && !tokenOpt.available) {
        recordUnavailable(tokenOpt, "tokenOptimizer")
      }
      if (tokenSensitive) {
        const primary = defaultFamily("token-sensitive but no token-optimizer available; use default read with truncation")
        chain.push(primary)
        return { primary, fallbacks: [], chain, notes }
      }
      // not token-sensitive → just default
      const primary = defaultFamily("non-token-sensitive read; default tools sufficient")
      chain.push(primary)
      return { primary, fallbacks: [], chain, notes }
    }

    case "web_research": {
      // Preferred: websearch (exa). Fallbacks (in order): grep_app, context7, default.
      if (websearch?.available) {
        const primary = mcpFamily("websearch", "websearch", true, "websearch (exa) available for open-ended research")
        chain.push(primary)
        if (grepApp?.available) chain.push(mcpFamily("code_text_search", "grep_app", false, "fallback code search"))
        if (context7?.available) chain.push(mcpFamily("library_docs", "context7", false, "fallback library docs"))
        const fb = defaultFamily("read when no web/research tool is available")
        chain.push(fb)
        return { primary, fallbacks: chain.slice(1), chain, notes }
      }
      if (websearch && !websearch.available) recordUnavailable(websearch, "websearch")
      if (grepApp?.available) {
        const primary = mcpFamily("code_text_search", "grep_app", true, "websearch unavailable; grep_app provides code search")
        chain.push(primary)
        if (context7?.available) chain.push(mcpFamily("library_docs", "context7", false, "fallback library docs after grep_app"))
        const fb = defaultFamily("read when grep_app not available")
        chain.push(fb)
        return { primary, fallbacks: chain.slice(1), chain, notes }
      }
      if (context7?.available) {
        const primary = mcpFamily("library_docs", "context7", true, "websearch and grep_app unavailable; context7 as last-resort research fallback")
        chain.push(primary)
        const fb = defaultFamily("read when no research tool is available")
        chain.push(fb)
        return { primary, fallbacks: [fb], chain, notes }
      }
      const primary = defaultFamily("no web/research tool available")
      chain.push(primary)
      return { primary, fallbacks: [], chain, notes }
    }

    case "library_docs": {
      if (context7?.available) {
        const primary = mcpFamily("library_docs", "context7", true, "context7 available for library docs")
        chain.push(primary)
        const fb = defaultFamily("read when context7 not available")
        chain.push(fb)
        return { primary, fallbacks: [fb], chain, notes }
      }
      if (context7 && !context7.available) recordUnavailable(context7, "context7")
      const primary = defaultFamily("context7 unavailable; read library source or docs directly")
      chain.push(primary)
      return { primary, fallbacks: [], chain, notes }
    }

    case "code_text_search": {
      if (grepApp?.available) {
        const primary = mcpFamily("code_text_search", "grep_app", true, "grep_app available for code search")
        chain.push(primary)
        const fb = defaultFamily("grep when grep_app not available")
        chain.push(fb)
        return { primary, fallbacks: [fb], chain, notes }
      }
      if (grepApp && !grepApp.available) recordUnavailable(grepApp, "grep_app")
      const primary = defaultFamily("grep_app unavailable; use default grep")
      chain.push(primary)
      return { primary, fallbacks: [], chain, notes }
    }

    case "general":
    default: {
      const primary = defaultFamily("no specialized intent; default read/grep sufficient")
      chain.push(primary)
      fallbacks.push(primary)
      return { primary, fallbacks, chain, notes }
    }
  }
}

/**
 * Convenience: choose the token-sensitive policy when a doc/event/plan
 * payload crosses a token threshold. Otherwise return null to indicate
 * the caller should not activate token-optimizer.
 */
export function shouldActivateTokenOptimization(estimatedTokens: number, threshold: number, availability: McpAvailability[]): ToolFamily | null {
  const tokenOpt = findAvailability(availability, "tokenOptimizer")
  if (!tokenOpt?.available) return null
  if (estimatedTokens < threshold) return null
  return mcpFamily(
    "token-optimizer",
    "tokenOptimizer",
    true,
    `estimated ${estimatedTokens} tokens >= threshold ${threshold}`,
  )
}
