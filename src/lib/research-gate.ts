/**
 * Research Gate — shared research-first enforcement for FlowDeck commands.
 *
 * Enforces that major workflow stages (discuss, plan, execute, fix-bug)
 * perform targeted research BEFORE asking human questions or producing plans.
 *
 * Research is scoped to the stage:
 * - discuss: gather facts and open questions from repo evidence
 * - plan: gather implementation constraints and design options
 * - execute: verify actual code paths and impacted files
 * - fix-bug: inspect bug path, reproduction, and known remedies
 *
 * Research results are persisted in shared state so later stages can reuse them.
 * Freshness metadata determines whether existing research is sufficient or
 * new research is needed.
 */

import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { statePath, planningDir, timestamp, isStateFresh, publishStateUpdate, readPlanningState, type PlanningState } from "../tools/planning-state-lib"
import { codebaseDir } from "../tools/codebase-state"

export type ResearchScope = "discuss" | "plan" | "execute" | "fix-bug"

/** Evidence collected during a research pass. */
export interface ResearchEvidence {
  /** Which scope this evidence is for. */
  scope: ResearchScope
  /** When this evidence was collected. */
  collectedAt: string
  /** Files that were read/inspected. */
  filesExplored: string[]
  /** Key findings from the research. */
  findings: string[]
  /** Whether MCP tools were used. */
  mcpToolsUsed: string[]
  /** Whether the research gate was satisfied (enough evidence gathered). */
  gateSatisfied: boolean
  /** Whether additional exploration was skipped (fresh evidence existed). */
  skippedExploration: boolean
  /** Summary version when this research was conducted. */
  summaryVersion: number
}

/** Diagnostics logged during research. */
export interface ResearchDiagnostics {
  /** Research scope. */
  scope: ResearchScope
  /** Timestamp of research. */
  timestamp: string
  /** Sources consulted. */
  sourcesUsed: string[]
  /** MCP tools invoked. */
  mcpToolsInvoked: string[]
  /** Evidence collected. */
  evidenceCollected: string[]
  /** Whether gate was satisfied. */
  gateSatisfied: boolean
  /** Whether additional exploration was skipped. */
  skippedExploration: boolean
}

const RESEARCH_KEY_PREFIX = "research_"

/**
 * Check whether existing research in shared state is still fresh enough to reuse.
 * Research is considered fresh if:
 * 1. The summaryVersion matches the current state's summaryVersion
 * 2. The state itself is fresh (within 5 minutes)
 * 3. The research scope matches
 */
export function isResearchFresh(state: PlanningState, scope: ResearchScope): boolean {
  if (!isStateFresh(state, 5 * 60 * 1000)) return false
  const researchVersion = (state as unknown as Record<string, unknown>)[`${RESEARCH_KEY_PREFIX}${scope}_version`] as number | undefined
  return researchVersion === state.summaryVersion
}

/**
 * Persist research evidence to STATE.md so later stages can reuse it.
 */
export function persistResearchEvidence(dir: string, scope: ResearchScope, evidence: ResearchEvidence): void {
  const sp = statePath(dir)
  if (!existsSync(sp)) return
  let content = readFileSync(sp, "utf-8")

  const evidenceJson = JSON.stringify(evidence).replace(/'/g, "''")
  const key = `${RESEARCH_KEY_PREFIX}${scope}`
  const versionKey = `${key}_version`

  const upsertLine = (current: string, k: string, value: string): string => {
    const pattern = new RegExp(`^${k}:\\s*.*$`, "m")
    if (pattern.test(current)) return current.replace(pattern, `${k}: ${value}`)
    return `${current.trimEnd()}\n${k}: ${value}\n`
  }

  content = upsertLine(content, key, `'${evidenceJson}'`)
  content = upsertLine(content, versionKey, `${evidence.summaryVersion}`)
  // Append to session history
  const entry = `- ${timestamp()} — Research (${scope}) persisted: ${evidence.findings.length} findings, gateSatisfied=${evidence.gateSatisfied}`
  if (content.includes("## Session History")) {
    content = content.replace(/(\n## Session History\n)/, `${entry}\n`)
  } else {
    content = content.trimEnd() + `\n## Session History\n${entry}\n`
  }

  writeFileSync(sp, content, "utf-8")
}

/**
 * Load persisted research evidence for a given scope.
 */
export function loadResearchEvidence(dir: string, scope: ResearchScope): ResearchEvidence | null {
  const sp = statePath(dir)
  if (!existsSync(sp)) return null
  const content = readFileSync(sp, "utf-8")
  const key = `${RESEARCH_KEY_PREFIX}${scope}`
  const match = content.match(new RegExp(`^${key}:\\s*'(.+)'`, "m"))
  if (!match) return null
  try {
    const unescaped = match[1].replace(/''/g, "'")
    return JSON.parse(unescaped) as ResearchEvidence
  } catch {
    return null
  }
}

/**
 * Build diagnostics log entry for a research pass.
 */
export function buildResearchDiagnostics(evidence: ResearchEvidence): ResearchDiagnostics {
  return {
    scope: evidence.scope,
    timestamp: evidence.collectedAt,
    sourcesUsed: evidence.filesExplored,
    mcpToolsInvoked: evidence.mcpToolsUsed,
    evidenceCollected: evidence.findings,
    gateSatisfied: evidence.gateSatisfied,
    skippedExploration: evidence.skippedExploration,
  }
}

/**
 * Log research diagnostics via the provided logger (safe for TUI environments).
 * Defaults to a no-op so raw stdout is never written from the plugin runtime.
 * Pass `logger: console.log` only in non-TUI contexts (e.g. standalone scripts).
 */
export function logResearchDiagnostics(
  diags: ResearchDiagnostics,
  logger: (msg: string) => void = () => {},
): void {
  logger(`[ResearchGate:${diags.scope}] Timestamp: ${diags.timestamp}`)
  logger(`[ResearchGate:${diags.scope}] Sources used: ${diags.sourcesUsed.length > 0 ? diags.sourcesUsed.join(", ") : "(none)"}`)
  logger(`[ResearchGate:${diags.scope}] MCP tools invoked: ${diags.mcpToolsInvoked.length > 0 ? diags.mcpToolsInvoked.join(", ") : "(none)"}`)
  logger(`[ResearchGate:${diags.scope}] Evidence collected: ${diags.evidenceCollected.length}`)
  for (const f of diags.evidenceCollected) {
    logger(`  - ${f}`)
  }
  logger(`[ResearchGate:${diags.scope}] Gate satisfied: ${diags.gateSatisfied}`)
  logger(`[ResearchGate:${diags.scope}] Skipped exploration: ${diags.skippedExploration}`)
}

/**
 * Perform a research pass for a given scope, checking freshness first.
 *
 * Returns ResearchEvidence with gateSatisfied=true if enough evidence was gathered.
 * If existing research is fresh, returns that and sets skippedExploration=true.
 */
export async function runResearchGate(
  dir: string,
  scope: ResearchScope,
  options?: {
    forceRefresh?: boolean
    customEvidence?: Partial<ResearchEvidence>
    /** Optional logger for diagnostics. Defaults to no-op to avoid corrupting TUI output. */
    logger?: (msg: string) => void
  }
): Promise<ResearchEvidence> {
  const logger = options?.logger ?? (() => {})
  const state = readPlanningState(dir)

  // Check freshness — reuse existing research if still fresh
  if (!options?.forceRefresh && isResearchFresh(state, scope)) {
    const existing = loadResearchEvidence(dir, scope)
    if (existing) {
      const evidence: ResearchEvidence = {
        ...existing,
        skippedExploration: true,
      }
      logResearchDiagnostics(buildResearchDiagnostics(evidence), logger)
      return evidence
    }
  }

  // Gather fresh evidence
  const filesExplored: string[] = []
  const findings: string[] = []
  const mcpToolsUsed: string[] = []

  // Core research: read shared state and planning files
  const sp = statePath(dir)
  if (existsSync(sp)) {
    filesExplored.push(sp)
    const stateContent = readFileSync(sp, "utf-8")
    findings.push(`STATE.md: phase=${state.phase}, status=${state.status}, plan_confirmed=${state.plan_confirmed}`)
  }

  // Read codebase index if available
  const cbDir = codebaseDir(dir)
  const architecturePath = join(cbDir, "ARCHITECTURE.md")
  if (existsSync(architecturePath)) {
    filesExplored.push(architecturePath)
    findings.push("ARCHITECTURE.md: codebase map available")
  }

  // Read PROJECT.md if available
  const projectPath = join(planningDir(dir), "PROJECT.md")
  if (existsSync(projectPath)) {
    filesExplored.push(projectPath)
    findings.push("PROJECT.md: project context available")
  }

  // Scope-specific research
  switch (scope) {
    case "discuss": {
      // Prior discussions
      const planningPath = planningDir(dir)
      if (existsSync(planningPath)) {
        const { readdirSync } = await import("fs")
        try {
          const phasesDir = join(planningPath, "phases")
          if (existsSync(phasesDir)) {
            const phases = readdirSync(phasesDir).filter(n => n.startsWith("phase-"))
            for (const phase of phases) {
              const discussPath = join(phasesDir, phase, "DISCUSS.md")
              if (existsSync(discussPath)) {
                filesExplored.push(discussPath)
                findings.push(`${phase}/DISCUSS.md: prior decisions loaded`)
              }
            }
          }
        } catch { /* ignore */ }
      }
      break
    }
    case "plan": {
      const planFile = join(planningDir(dir), "phases", `phase-${state.phase}`, "DISCUSS.md")
      if (existsSync(planFile)) {
        filesExplored.push(planFile)
        findings.push(`DISCUSS.md: decisions loaded for phase ${state.phase}`)
      }
      break
    }
    case "execute": {
      const planFile = join(planningDir(dir), "phases", `phase-${state.phase}`, "PLAN.md")
      if (existsSync(planFile)) {
        filesExplored.push(planFile)
        findings.push(`PLAN.md: implementation steps loaded for phase ${state.phase}`)
      }
      break
    }
    case "fix-bug": {
      const failuresPath = join(cbDir, "FAILURES.json")
      if (existsSync(failuresPath)) {
        filesExplored.push(failuresPath)
        findings.push("FAILURES.json: prior bug records loaded")
      }
      break
    }
  }

  const evidence: ResearchEvidence = {
    scope,
    collectedAt: timestamp(),
    filesExplored,
    findings,
    mcpToolsUsed,
    gateSatisfied: findings.length > 0,
    skippedExploration: false,
    summaryVersion: state.summaryVersion,
    ...options?.customEvidence,
  }

  // Update state freshness — this increments summaryVersion
  publishStateUpdate(dir, `research-gate:${scope}`, state.phase)

  // Now read the new summaryVersion and update the research version key to match
  const updatedState = readPlanningState(dir)
  const evidenceFinal: ResearchEvidence = {
    ...evidence,
    summaryVersion: updatedState.summaryVersion,
  }
  // Re-persist with correct version (publishStateUpdate incremented summaryVersion)
  persistResearchEvidence(dir, scope, evidenceFinal)

  const diagnostics = buildResearchDiagnostics(evidenceFinal)
  logResearchDiagnostics(diagnostics, logger)

  return evidenceFinal
}

/**
 * Check if a stage should proceed or block based on research gate.
 * Returns an error message if the gate is not satisfied and the stage should block.
 */
export function researchGateStatus(evidence: ResearchEvidence): { satisfied: boolean; blocker?: string } {
  if (!evidence.gateSatisfied) {
    return {
      satisfied: false,
      blocker: `Research gate not satisfied for ${evidence.scope}. Missing evidence.`,
    }
  }
  return { satisfied: true }
}