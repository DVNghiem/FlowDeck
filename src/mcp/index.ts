/**
 * FlowDeck built-in MCP server configurations.
 *
 * Four free, read-only remote MCPs are enabled by default:
 *   - context7    https://mcp.context7.com/mcp  (library docs lookup)
 *   - websearch   https://mcp.exa.ai/mcp        (web search via Exa)
 *   - grep_app    https://mcp.grep.app           (code search)
 *   - github      https://api.githubcopilot.com/mcp/  (GitHub code search)
 *
 * Local stdio MCPs (when installed):
 *   - codegraph   codegraph serve --mcp          (code knowledge graph — symbol search, call graphs, impact analysis)
 *
 * Additional local stdio MCPs (enabled by default):
 *   - memory                 npx -y @modelcontextprotocol/server-memory
 *   - sequential-thinking    npx -y @modelcontextprotocol/server-sequential-thinking
 *   - magic                  npx -y @magicuidesign/mcp@latest
 *   - playwright             npx -y @playwright/mcp --browser chrome
 *   - token-optimizer        npx -y token-optimizer-mcp
 *
 * Disable individual MCPs with: FLOWDECK_DISABLE_MCP=context7,websearch,grep_app,github,codegraph,memory,sequential-thinking,magic,playwright,token-optimizer
 */

import { spawnSync } from "child_process"
import { isCodegraphInstalled } from "../services/codegraph"

type RemoteMcp = {
  type: "remote"
  url: string
  enabled: boolean
  headers?: Record<string, string>
  oauth?: false
}

type LocalMcp = {
  type: "local"
  command: string[]
  environment?: Record<string, string>
  enabled: boolean
}

/** Stable, normalized MCP identifier. Used for policy/tool-selection lookups. */
export type McpName =
  | "context7"
  | "websearch"
  | "grep_app"
  | "github"
  | "codegraph"
  | "memory"
  | "sequentialThinking"
  | "magic"
  | "playwright"
  | "tokenOptimizer"

/** Per-MCP availability metadata — used by tool-selection-policy and logs. */
export interface McpAvailability {
  name: McpName
  enabled: boolean
  available: boolean
  unavailableReason?: string
  type: "remote" | "local"
}

function getDisabledMcps(): Set<string> {
  const raw = process.env.FLOWDECK_DISABLE_MCP ?? ""
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
}

function isLauncherAvailable(launcher: string): boolean {
  try {
    const result = spawnSync(launcher, ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function createFlowDeckMcps(): Record<string, RemoteMcp | LocalMcp> {
  return buildFlowDeckMcpsWithMeta().mcps
}

/**
 * Build MCPs and emit availability metadata in a single pass.
 *
 * Returning the metadata alongside the MCP record lets the tool-selection
 * policy and the orchestrator log know exactly which specialized tools are
 * present in this environment, without re-detecting them.
 */
export function buildFlowDeckMcpsWithMeta(): {
  mcps: Record<string, RemoteMcp | LocalMcp>
  availability: McpAvailability[]
} {
  const disabled = getDisabledMcps()
  const npxAvailable = isLauncherAvailable("npx")
  const codegraphAvailable = isCodegraphInstalled()
  const mcps: Record<string, RemoteMcp | LocalMcp> = {}
  const availability: McpAvailability[] = []

  // Remote MCPs — disabled only via env var
  if (!disabled.has("context7")) {
    mcps.context7 = {
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      enabled: true,
      ...(process.env.CONTEXT7_API_KEY
        ? { headers: { Authorization: `Bearer ${process.env.CONTEXT7_API_KEY}` } }
        : {}),
      oauth: false,
    }
  }
  availability.push({
    name: "context7",
    enabled: !disabled.has("context7"),
    available: !disabled.has("context7"),
    type: "remote",
  })

  if (!disabled.has("websearch")) {
    const exaKey = process.env.EXA_API_KEY
    mcps.websearch = {
      type: "remote",
      // Keep secrets out of the URL: pass EXA_API_KEY via the `x-api-key` header
      // (see headers below). The remote MCP server reads it from there.
      url: "https://mcp.exa.ai/mcp?tools=web_search_exa",
      enabled: true,
      ...(exaKey ? { headers: { "x-api-key": exaKey } } : {}),
      oauth: false,
    }
  }
  availability.push({
    name: "websearch",
    enabled: !disabled.has("websearch"),
    available: !disabled.has("websearch"),
    type: "remote",
  })

  if (!disabled.has("grep_app")) {
    mcps.grep_app = {
      type: "remote",
      url: "https://mcp.grep.app",
      enabled: true,
      oauth: false,
    }
  }
  availability.push({
    name: "grep_app",
    enabled: !disabled.has("grep_app"),
    available: !disabled.has("grep_app"),
    type: "remote",
  })

  if (!disabled.has("github")) {
    mcps.github = {
      type: "remote",
      url: "https://api.githubcopilot.com/mcp/",
      enabled: true,
      ...(process.env.GITHUB_TOKEN
        ? { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
        : {}),
      oauth: false,
    }
  }
  availability.push({
    name: "github",
    enabled: !disabled.has("github"),
    available: !disabled.has("github"),
    type: "remote",
  })

  // Codegraph — gated by install detection
  if (!disabled.has("codegraph")) {
    if (codegraphAvailable) {
      mcps.codegraph = {
        type: "local",
        command: ["codegraph", "serve", "--mcp"],
        enabled: true,
      }
      availability.push({
        name: "codegraph",
        enabled: true,
        available: true,
        type: "local",
      })
    } else {
      availability.push({
        name: "codegraph",
        enabled: true,
        available: false,
        unavailableReason: "codegraph binary not on PATH (install via `npm install -g @colbymchenry/codegraph`)",
        type: "local",
      })
    }
  } else {
    availability.push({
      name: "codegraph",
      enabled: false,
      available: false,
      unavailableReason: "disabled via FLOWDECK_DISABLE_MCP",
      type: "local",
    })
  }

  // npx-backed local MCPs. The disable-key in FLOWDECK_DISABLE_MCP is the
  // kebab-case form; the runtime MCP key (consumed by tests + downstream code)
  // is camelCase to match the historical API.
  const npxGated: Array<{ name: McpName; key: string; disableKey: string; command: string[] }> = [
    { name: "memory", key: "memory", disableKey: "memory", command: ["npx", "-y", "@modelcontextprotocol/server-memory"] },
    { name: "sequentialThinking", key: "sequentialThinking", disableKey: "sequential-thinking", command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"] },
    { name: "magic", key: "magic", disableKey: "magic", command: ["npx", "-y", "@magicuidesign/mcp@latest"] },
    { name: "playwright", key: "playwright", disableKey: "playwright", command: ["npx", "-y", "@playwright/mcp", "--browser", "chrome"] },
    { name: "tokenOptimizer", key: "tokenOptimizer", disableKey: "token-optimizer", command: ["npx", "-y", "token-optimizer-mcp"] },
  ]

  for (const mcp of npxGated) {
    if (disabled.has(mcp.disableKey)) {
      availability.push({
        name: mcp.name,
        enabled: false,
        available: false,
        unavailableReason: "disabled via FLOWDECK_DISABLE_MCP",
        type: "local",
      })
      continue
    }
    if (!npxAvailable) {
      availability.push({
        name: mcp.name,
        enabled: true,
        available: false,
        unavailableReason: "npx launcher not available on PATH",
        type: "local",
      })
      continue
    }
    mcps[mcp.key] = {
      type: "local",
      command: mcp.command,
      enabled: true,
    }
    availability.push({
      name: mcp.name,
      enabled: true,
      available: true,
      type: "local",
    })
  }

  return { mcps, availability }
}
