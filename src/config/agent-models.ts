import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

export interface AgentModelConfig {
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface FlowDeckConfig {
  /** Per-agent model overrides (preferred key). */
  agentModels?: Record<string, AgentModelConfig>
  /** Legacy per-agent model overrides (still supported). */
  agents?: Record<string, AgentModelConfig>
  /** Enable autonomous ultrawork loop. */
  ultrawork?: boolean
  /** Maximum delegation depth for agent chains. */
  maxDelegationDepth?: number
  /** Design-first workflow configuration. */
  designFirst?: {
    enabled?: boolean
    enforcement?: "strict" | "advisory"
    requireApprovalBeforeImplementation?: boolean
    modelOverrides?: Record<string, string>
    defaultSkillsByTaskType?: Record<string, string[]>
  }
  /** Governance layer configuration. */
  governance?: Record<string, unknown>
}

export const DEFAULT_CONFIG: FlowDeckConfig = {
  agentModels: {},
  ultrawork: false,
  maxDelegationDepth: 4,
}

function getGlobalConfigDir(): string {
  return (
    process.env.OPENCODE_CONFIG_DIR ||
    (process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "opencode")
      : join(homedir(), ".config", "opencode"))
  )
}

/**
 * Strip JSONC comments without corrupting string literals.
 * Handles single-line // comments and multi-line /* ... * / comments.
 */
export function stripJsonComments(content: string): string {
  let result = ""
  let inString = false
  let escape = false
  let i = 0

  while (i < content.length) {
    const ch = content[i]
    const next = content[i + 1]

    if (inString) {
      result += ch
      if (escape) {
        escape = false
      } else if (ch === "\\") {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
      i++
      continue
    }

    if (ch === '"') {
      inString = true
      result += ch
      i++
      continue
    }

    if (ch === "/" && next === "/") {
      // Skip until end of line
      while (i < content.length && content[i] !== "\n") i++
      continue
    }

    if (ch === "/" && next === "*") {
      // Skip until */
      i += 2
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i++
      i += 2
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * Load FlowDeck configuration from the first available location.
 *
 * Search order (first valid wins):
 *   1. <directory>/.flowdeck.jsonc
 *   2. <directory>/.flowdeck.json
 *   3. <directory>/.opencode/flowdeck.jsonc
 *   4. <directory>/.opencode/flowdeck.json
 *   5. global ~/.config/opencode/flowdeck.json
 *
 * Malformed files are silently skipped to preserve no-stdout behavior.
 */
export function loadFlowDeckConfig(directory?: string): FlowDeckConfig {
  const candidates: string[] = []

  if (directory) {
    candidates.push(join(directory, ".flowdeck.jsonc"))
    candidates.push(join(directory, ".flowdeck.json"))
    candidates.push(join(directory, ".opencode", "flowdeck.jsonc"))
    candidates.push(join(directory, ".opencode", "flowdeck.json"))
  }
  candidates.push(join(getGlobalConfigDir(), "flowdeck.json"))

  for (const configPath of candidates) {
    if (!existsSync(configPath)) continue
    try {
      const raw = readFileSync(configPath, "utf-8")
      const stripped = configPath.endsWith(".jsonc") ? stripJsonComments(raw) : raw
      return { ...DEFAULT_CONFIG, ...JSON.parse(stripped) }
    } catch {
      // Malformed config — try next candidate or return default.
    }
  }

  return { ...DEFAULT_CONFIG }
}

/**
 * Resolve per-agent model strings from the configuration.
 * agentModels takes precedence over the legacy agents key.
 */
export function resolveAgentModels(config: FlowDeckConfig): Record<string, string> {
  const result: Record<string, string> = {}

  const addFrom = (source?: Record<string, AgentModelConfig>) => {
    if (!source) return
    for (const [name, cfg] of Object.entries(source)) {
      if (cfg.model && !(name in result)) {
        result[name] = cfg.model
      }
    }
  }

  addFrom(config.agentModels)
  addFrom(config.agents)

  return result
}

/**
 * Parse a "provider/model" model spec into the SDK model shape.
 * Returns undefined if the spec is empty or has no separator.
 */
export function parseModelSpec(modelSpec?: string): { providerID: string; modelID: string } | undefined {
  if (!modelSpec) return undefined
  const separatorIndex = modelSpec.indexOf("/")
  if (separatorIndex <= 0 || separatorIndex === modelSpec.length - 1) return undefined
  return {
    providerID: modelSpec.slice(0, separatorIndex),
    modelID: modelSpec.slice(separatorIndex + 1),
  }
}
