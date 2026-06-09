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
 *   - omega-memory           uvx omega-memory serve
 *   - sequential-thinking    npx -y @modelcontextprotocol/server-sequential-thinking
 *   - magic                  npx -y @magicuidesign/mcp@latest
 *   - playwright             npx -y @playwright/mcp --browser chrome
 *   - token-optimizer        npx -y token-optimizer-mcp
 *
 * Disable individual MCPs with: FLOWDECK_DISABLE_MCP=context7,websearch,grep_app,github,codegraph,memory,omega-memory,sequential-thinking,magic,playwright,token-optimizer
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
  const disabled = getDisabledMcps()
  const mcps: Record<string, RemoteMcp | LocalMcp> = {}

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

  if (!disabled.has("websearch")) {
    const exaKey = process.env.EXA_API_KEY
    mcps.websearch = {
      type: "remote",
      url: exaKey
        ? `https://mcp.exa.ai/mcp?tools=web_search_exa&exaApiKey=${encodeURIComponent(exaKey)}`
        : "https://mcp.exa.ai/mcp?tools=web_search_exa",
      enabled: true,
      ...(exaKey ? { headers: { "x-api-key": exaKey } } : {}),
      oauth: false,
    }
  }

  if (!disabled.has("grep_app")) {
    mcps.grep_app = {
      type: "remote",
      url: "https://mcp.grep.app",
      enabled: true,
      oauth: false,
    }
  }

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

  // Register codegraph as a local stdio MCP server when it is installed.
  // This surfaces codegraph_context, codegraph_search, codegraph_explore,
  // codegraph_callers, codegraph_callees, codegraph_impact, codegraph_trace
  // to all agents, enabling code-intelligence-first exploration.
  if (!disabled.has("codegraph") && isCodegraphInstalled()) {
    mcps.codegraph = {
      type: "local",
      command: ["codegraph", "serve", "--mcp"],
      enabled: true,
    }
  }

  if (!disabled.has("memory") && isLauncherAvailable("npx")) {
    mcps.memory = {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
      enabled: true,
    }
  }

  if (!disabled.has("omega-memory") && isLauncherAvailable("uvx")) {
    mcps.omegaMemory = {
      type: "local",
      command: ["uvx", "omega-memory", "serve"],
      enabled: true,
    }
  }

  if (!disabled.has("sequential-thinking") && isLauncherAvailable("npx")) {
    mcps.sequentialThinking = {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
      enabled: true,
    }
  }

  if (!disabled.has("magic") && isLauncherAvailable("npx")) {
    mcps.magic = {
      type: "local",
      command: ["npx", "-y", "@magicuidesign/mcp@latest"],
      enabled: true,
    }
  }

  if (!disabled.has("playwright") && isLauncherAvailable("npx")) {
    mcps.playwright = {
      type: "local",
      command: ["npx", "-y", "@playwright/mcp", "--browser", "chrome"],
      enabled: true,
    }
  }

  if (!disabled.has("token-optimizer") && isLauncherAvailable("npx")) {
    mcps.tokenOptimizer = {
      type: "local",
      command: ["npx", "-y", "token-optimizer-mcp"],
      enabled: true,
    }
  }

  return mcps
}
