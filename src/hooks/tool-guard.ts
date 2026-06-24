/**
 * HOOK-04: Tool guard — blocks dangerous operations
 * Pattern matching on tool arguments to prevent destructive commands.
 * D-04: pure string.includes() matching, no path filtering, no regex/glob.
 * Also enforces architectural constraints from .codebase/CONSTRAINTS.md.
 * Default is ON; disable with FLOWDECK_TOOL_GUARD_ENABLED=off.
 */

const IS_ENABLED = () => process.env.FLOWDECK_TOOL_GUARD_ENABLED !== "off"

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"
import { phasePlanPath, readPlanningState } from "../tools/planning-state-lib"
import { isUiHeavyTask } from "../lib/task-routing"
import { loadFlowDeckConfig, resolveDesignFirstConfig } from "../config"
import type { FlowDeckConfig } from "../config/schema"
import { validateToolAccess } from "../services/agent-validator"
import { appendAuditEvent } from "../services/audit-log"
import { verifyAfterWrite } from "../services/verification-layer"

const BLOCKED_PATTERNS = {
  read: [".env", ".pem", ".key", ".secret"],
  write: ["node_modules"],
  bash: ["rm -rf"],
}

function getFilePath(args: any): string | undefined {
  return (
    args?.filePath ??
    args?.path ??
    args?.file_path ??
    args?.file ??
    undefined
  )
}

function checkBlockedPath(filePath: string, patterns: string[]): string | null {
  for (const p of patterns) {
    if (filePath.includes(p)) {
      return `FLOWDECK: Writing to "${p}" is blocked.`
    }
  }
  return null
}

const sessionWrittenFiles = new Map<string, Set<string>>()

const WRITE_TOOLS = new Set([
  "write", "write_file",
  "edit", "edit_file",
  "patch", "apply_patch", "patch_file",
  "hash-edit",
  "str-replace", "str_replace", "str_replace_editor",
  "create", "create_file",
])

export function recordWrite(sessionID: string, filePath: string): void {
  const files = sessionWrittenFiles.get(sessionID) ?? new Set()
  files.add(filePath)
  sessionWrittenFiles.set(sessionID, files)
}

export function getWriteCount(sessionID: string): number {
  return sessionWrittenFiles.get(sessionID)?.size ?? 0
}

export function clearWriteCounter(sessionID: string): void {
  sessionWrittenFiles.delete(sessionID)
}

export function checkWriteLimit(
  sessionID: string,
  filePath: string,
  maxWrites: number,
): string | null {
  const files = sessionWrittenFiles.get(sessionID) ?? new Set()
  if (!files.has(filePath) && files.size >= maxWrites) {
    return (
      `[FlowDeck] Write limit reached: this agent has already modified ` +
      `${files.size} unique files (configured max: ${maxWrites}).\n` +
      `Modified so far: ${[...files].join(", ")}\n` +
      `Stop now and report back to the orchestrator with:\n` +
      `  1. What was completed\n` +
      `  2. What files remain\n` +
      `  3. Whether a second workstream is needed\n` +
      `Do NOT continue editing more files without orchestrator confirmation.`
    )
  }
  return null
}

export type BlockReason = string | null

/**
 * Check if a tool operation should be blocked.
 * Returns error message if blocked, null if allowed.
 */
export function isBlocked(tool: string, args: any): BlockReason {
  const filePath = getFilePath(args)

  if (tool === "bash") {
    const cmd = args.command as string
    if (!cmd) return null
    for (const p of BLOCKED_PATTERNS.bash) {
      if (cmd.includes(p)) {
        return `FLOWDECK: Command containing "${p}" is blocked.`
      }
    }
    return null
  }

  if (tool === "read") {
    if (!filePath) return null
    for (const p of BLOCKED_PATTERNS.read) {
      if (filePath.includes(p)) {
        return `FLOWDECK: Access to "${p}" files is blocked.`
      }
    }
    return null
  }

  if (WRITE_TOOLS.has(tool)) {
    if (!filePath) return null
    const block = checkBlockedPath(filePath, BLOCKED_PATTERNS.write)
    if (block) return block
    return null
  }

  return null
}

/**
 * Architectural Constraint Guard.
 * Reads .codebase/CONSTRAINTS.md for forbidden path patterns and boundary rules.
 * Returns a block reason if the write/edit violates a constraint, null otherwise.
 *
 * CONSTRAINTS.md format (simple list of patterns in a ## Forbidden Paths section):
 *   ## Forbidden Paths
 *   - src/core/       # do not modify core directly
 *   - generated/      # auto-generated, do not edit manually
 */
export function checkArchConstraint(directory: string, filePath: string): BlockReason {
  const constraintsPath = join(codebaseDir(directory), "CONSTRAINTS.md")
  if (!existsSync(constraintsPath)) return null
  try {
    const content = readFileSync(constraintsPath, "utf-8")
    const match = content.match(/## Forbidden Paths\n([\s\S]*?)(?:\n##|$)/)
    if (!match) return null
    for (const line of match[1].split("\n")) {
      const pattern = line.replace(/^-\s*/, "").split("#")[0].trim()
      if (pattern && filePath.includes(pattern)) {
        return `FLOWDECK [arch-constraint]: editing "${pattern}" is forbidden by .codebase/CONSTRAINTS.md`
      }
    }
  } catch { /* skip */ }
  return null
}

/**
 * Phase Enforcement Guard.
 * Prevents writing to the codebase during planning phases.
 */
export function checkPhaseEnforcement(directory: string): BlockReason {
  try {
    const state = readPlanningState(directory)
    const flowdeckConfig = resolveDesignFirstConfig(loadFlowDeckConfig(directory))
    // Phases: 1=discuss, 2=plan, 3=execute, 4=review
    // Block write/edit if in phase 1 or 2
    if (state.phase > 0 && state.phase < 3) {
      if (state.plan_confirmed) return null
      return `FLOWDECK [phase-gate]: writing to codebase is blocked in phase ${state.phase} (${state.phase === 1 ? "discuss" : "plan"}). Run /fd-plan --confirm to enter execute phase.`
    }
    if (flowdeckConfig.enabled && flowdeckConfig.requireApprovalBeforeImplementation && isUiDesignApprovalRequired(directory)) {
      if (flowdeckConfig.enforcement === "advisory") {
        return `FLOWDECK [design-gate]: advisory design-first mode detected missing approval. Run /fd-design --mode=draft or set design_override=true in STATE.md.`
      }
      return `FLOWDECK [design-gate]: UI-heavy task requires approved design handoff before implementation. Run /fd-design --mode=draft and ensure design_stage=handoff_complete + design_approved=true, or set explicit design_override with reason.`
    }
  } catch {
    // If STATE.md doesn't exist or is invalid, don't block
  }
  return null
}

function isUiDesignApprovalRequired(directory: string): boolean {
  const state = readPlanningState(directory)
  if (state.design_override && state.design_override_reason && state.design_override_reason.trim().length > 0) return false
  if (state.requires_design_first) {
    return !(state.design_stage === "handoff_complete" && state.design_approved)
  }
  if (state.task_type && isUiHeavyTask(state.task_type)) {
    return !(state.design_stage === "handoff_complete" && state.design_approved)
  }
  const planPath = phasePlanPath(directory, state.phase || 1)
  if (!existsSync(planPath)) return false
  const planContent = readFileSync(planPath, "utf-8")
  if (!isUiHeavyTask(planContent)) return false
  return !(state.design_stage === "handoff_complete" && state.design_approved)
}

export interface ToolGuardDecision {
  tool: string
  allowed: boolean
  reason: string | null
  checks: string[]
}

const recentDecisions: ToolGuardDecision[] = []
const MAX_DECISIONS = 50

function logDecision(ctx: ToolGuardContext, decision: ToolGuardDecision, input: { sessionID?: string; agent?: string; tool?: string }): void {
  recentDecisions.push(decision)
  if (recentDecisions.length > MAX_DECISIONS) {
    recentDecisions.shift()
  }
  appendAuditEvent(ctx.directory, {
    kind: decision.allowed ? "guard.allow" : "guard.block",
    session_id: input.sessionID,
    agent: input.agent,
    tool: decision.tool,
    decision: decision.allowed ? "allow" : "block",
    reason: decision.reason ?? undefined,
    details: { checks: decision.checks },
  })
}

export function getRecentToolGuardDecisions(): ToolGuardDecision[] {
  return recentDecisions.slice()
}

export function clearToolGuardDecisions(): void {
  recentDecisions.length = 0
}

interface ToolGuardContext {
  directory: string
  agent?: string
  session?: { agent?: string }
}

interface ToolGuardInput {
  tool: string
  sessionID?: string
  name?: string
  args?: any
  agent?: string
}

/**
 * Resolve the agent name from realistic OpenCode SDK payload locations.
 * The SDK `tool.execute.before` payload does not include `input.agent`;
 * the agent is supplied on the surrounding context/session metadata.
 */
function resolveAgentName(ctx: ToolGuardContext, input: ToolGuardInput): string | undefined {
  return ctx.agent ?? ctx.session?.agent ?? input.agent
}

/**
 * HOOK-04: Tool guard hook
 * Called on tool.execute.before for all tools.
 * Blocks dangerous read/write/bash/edit operations, arch-constraint violations, and premature implementation.
 */
export async function toolGuardHook(
  ctx: ToolGuardContext,
  input: ToolGuardInput,
  output: { args: any }
): Promise<void> {
  const toolName = input.tool ?? input.name ?? ""
  const sessionID = input.sessionID ?? ""
  const agentName = resolveAgentName(ctx, input)
  const decision: ToolGuardDecision = { tool: toolName, allowed: true, reason: null, checks: [] }

  if (!IS_ENABLED()) {
    decision.allowed = true
    decision.reason = "tool guard disabled via FLOWDECK_TOOL_GUARD_ENABLED=off"
    logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
    return
  }

  const args = output.args ?? input.args ?? {}

  // HOOK-04-WL: Write-limit guard — cap unique files modified per agent session.
  let pendingWriteFilePath: string | null = null
  if (WRITE_TOOLS.has(toolName)) {
    const filePath = getFilePath(args) ?? ""
    if (filePath) {
      const config: FlowDeckConfig = loadFlowDeckConfig(ctx.directory)
      const maxWrites = config.maxWritesPerAgent ?? 15
      if (maxWrites > 0) {
        const limitMsg = checkWriteLimit(sessionID, filePath, maxWrites)
        if (limitMsg) {
          decision.allowed = false
          decision.reason = limitMsg
          decision.checks.push("write-limit")
          logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
          throw new Error(limitMsg)
        }
        pendingWriteFilePath = filePath
      }
    }
  }

  // Check known dangerous tools including edit, patch, hash-edit, create, str_replace.
  if (toolName !== "bash" && toolName !== "read" && !WRITE_TOOLS.has(toolName)) {
    decision.checks.push("no-op")
    logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
    return
  }

  const blockReason = isBlocked(toolName, args)
  if (blockReason) {
    decision.allowed = false
    decision.reason = blockReason
    decision.checks.push("dangerous-pattern")
    logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
    throw new Error(blockReason)
  }

  // Worker agent tool-permission enforcement (agent resolved from context/session/input).
  if (agentName && typeof agentName === "string") {
    decision.checks.push("agent-contract")
    const validation = validateToolAccess(ctx.directory, agentName, toolName)
    const hasBlockViolation = validation.violations.some((v) => v.severity === "block")
    if (validation.action === "block" || hasBlockViolation) {
      const msg = validation.message ?? `FLOWDECK: Agent ${agentName} is not permitted to use ${toolName}`
      decision.allowed = false
      decision.reason = msg
      logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
      throw new Error(msg)
    }
  }

  // Phase & Arch-constraint check on all write/edit/patch/create tools.
  if (WRITE_TOOLS.has(toolName)) {
    decision.checks.push("phase-gate")
    const phaseBlock = checkPhaseEnforcement(ctx.directory)
    if (phaseBlock) {
      decision.allowed = false
      decision.reason = phaseBlock
      logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
      throw new Error(phaseBlock)
    }

    decision.checks.push("arch-constraint")
    const filePath = getFilePath(args) ?? ""
    if (filePath) {
      const constraintBlock = checkArchConstraint(ctx.directory, filePath)
      if (constraintBlock) {
        decision.allowed = false
        decision.reason = constraintBlock
        logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })
        throw new Error(constraintBlock)
      }
    }
  }

  decision.checks.push("allowed")
  logDecision(ctx, decision, { sessionID, agent: agentName, tool: toolName })

  // Record the write only after all guard checks have passed.
  if (pendingWriteFilePath) {
    recordWrite(sessionID, pendingWriteFilePath)
    // Best-effort post-write verification; failures are logged but do not block.
    verifyAfterWrite(ctx.directory, {
      sessionID,
      agent: agentName,
      tool: toolName,
      filePath: pendingWriteFilePath,
    })
  }
}