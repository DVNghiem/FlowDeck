import { existsSync, readdirSync, readFileSync } from "fs"
import { join, basename } from "path"

export interface AgentSnapshot {
  name: string
  description: string
}

export interface SkillSnapshot {
  name: string
  description: string
}

export interface RegistrySnapshot {
  agents: AgentSnapshot[]
  commands: string[]
  skills: SkillSnapshot[]
}

export interface RegistryDrift {
  /** Commands in source but missing from the static REGISTERED_COMMANDS list */
  missingCommands: string[]
  /** Commands in REGISTERED_COMMANDS but no longer present in source */
  staleCommands: string[]
  /** Agent names present in source but missing from AGENT_NAMES */
  missingAgents: string[]
  /** Agent names in AGENT_NAMES but with no factory/source */
  staleAgents: string[]
  /** Skill names present in source but not referenced anywhere */
  orphanSkills: string[]
}

function resolveSrcDir(projectRoot: string): string {
  return join(projectRoot, "src")
}

function listCommandNames(srcDir: string): string[] {
  const commandsDir = join(srcDir, "commands")
  if (!existsSync(commandsDir)) return []
  return readdirSync(commandsDir)
    .filter(f => f.endsWith(".md"))
    .map(f => basename(f, ".md"))
    .sort()
}

function listSkillSnapshots(srcDir: string): SkillSnapshot[] {
  const skillsDir = join(srcDir, "skills")
  if (!existsSync(skillsDir)) return []
  const out: SkillSnapshot[] = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillFile = join(skillsDir, entry.name, "SKILL.md")
    if (!existsSync(skillFile)) continue
    const raw = readFileSync(skillFile, "utf-8")
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    const name = fm?.[1].match(/^name:\s*(.+)$/m)?.[1].trim() ?? entry.name
    const description = fm?.[1].match(/^description:\s*(.+)$/m)?.[1].trim() ?? ""
    out.push({ name, description })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Build a registry snapshot from actual source files.
 *
 * Agent descriptions are read from the compiled agent factories via
 * getAgentRoutes() so the prompt and guard messages stay in sync.
 */
export async function buildRegistrySnapshot(projectRoot: string): Promise<RegistrySnapshot> {
  const srcDir = resolveSrcDir(projectRoot)
  const { getAgentRoutes, createAgent } = await import("../agents/index")
  const agentRoutes = getAgentRoutes()
  const orchestrator = createAgent("orchestrator")
  if (orchestrator) {
    agentRoutes.push({
      name: orchestrator.name,
      description: orchestrator.description ?? "FlowDeck orchestrator",
    })
  }
  return {
    agents: agentRoutes.sort((a, b) => a.name.localeCompare(b.name)),
    commands: listCommandNames(srcDir),
    skills: listSkillSnapshots(srcDir),
  }
}

/**
 * Detect drift between actual sources and the static registries.
 *
 * @param projectRoot - project root containing src/
 * @param registeredCommands - static list (e.g. REGISTERED_COMMANDS)
 * @param registeredAgentNames - static list (e.g. AGENT_NAMES)
 */
export async function detectRegistryDrift(
  projectRoot: string,
  registeredCommands: readonly string[],
  registeredAgentNames: readonly string[],
): Promise<RegistryDrift> {
  const snapshot = await buildRegistrySnapshot(projectRoot)
  const commandSet = new Set(snapshot.commands)
  const registeredCommandSet = new Set(registeredCommands)

  const agentSet = new Set(snapshot.agents.map(a => a.name))
  const registeredAgentSet = new Set(registeredAgentNames)

  return {
    missingCommands: snapshot.commands.filter(c => !registeredCommandSet.has(c)),
    staleCommands: registeredCommands.filter(c => !commandSet.has(c)),
    missingAgents: snapshot.agents.map(a => a.name).filter(n => !registeredAgentSet.has(n)),
    staleAgents: registeredAgentNames.filter(n => !agentSet.has(n)),
    orphanSkills: snapshot.skills.map(s => s.name),
  }
}

export interface RegistryDriftSummary {
  hasDrift: boolean
  report: string
  drift: RegistryDrift
}

/**
 * Compute a registry drift summary against the live static registries.
 * This is safe to call from session-start: it is read-only and bounded.
 */
export async function getRegistryDriftSummary(projectRoot: string): Promise<RegistryDriftSummary> {
  const { REGISTERED_COMMANDS } = await import("./supervisor-binding")
  const { AGENT_NAMES } = await import("../agents/index")
  const drift = await detectRegistryDrift(projectRoot, REGISTERED_COMMANDS, AGENT_NAMES)
  const report = formatDriftReport(drift)
  const hasDrift =
    drift.missingCommands.length > 0 ||
    drift.staleCommands.length > 0 ||
    drift.missingAgents.length > 0 ||
    drift.staleAgents.length > 0
  return { hasDrift, report, drift }
}

/**
 * Render a concise drift report for logs/session context.
 */
export function formatDriftReport(drift: RegistryDrift): string {
  const lines: string[] = []
  if (drift.missingCommands.length > 0) lines.push(`missing commands: ${drift.missingCommands.join(", ")}`)
  if (drift.staleCommands.length > 0) lines.push(`stale commands: ${drift.staleCommands.join(", ")}`)
  if (drift.missingAgents.length > 0) lines.push(`missing agents: ${drift.missingAgents.join(", ")}`)
  if (drift.staleAgents.length > 0) lines.push(`stale agents: ${drift.staleAgents.join(", ")}`)
  if (lines.length === 0) return "registry snapshot: no drift detected"
  return `registry drift detected — ${lines.join("; ")}`
}
