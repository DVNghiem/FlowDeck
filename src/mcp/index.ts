/**
 * FlowDeck built-in MCP server configurations.
 *
 * Four free, read-only remote MCPs are enabled by default:
 *   - context7    https://mcp.context7.com/mcp  (library docs lookup)
 *   - websearch   https://mcp.exa.ai/mcp        (web search via Exa)
 *   - grep_app    https://mcp.grep.app           (code search)
 *   - github      https://api.githubcopilot.com/mcp/  (GitHub code search)
 *
 * Disable individual MCPs with: FLOWDECK_DISABLE_MCP=context7,websearch,grep_app,github
 */

type RemoteMcp = {
  type: "remote"
  url: string
  enabled: boolean
  headers?: Record<string, string>
  oauth?: false
}

function getDisabledMcps(): Set<string> {
  const raw = process.env.FLOWDECK_DISABLE_MCP ?? ""
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
}

export function createFlowDeckMcps(): Record<string, RemoteMcp> {
  const disabled = getDisabledMcps()
  const mcps: Record<string, RemoteMcp> = {}

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

  return mcps
}
