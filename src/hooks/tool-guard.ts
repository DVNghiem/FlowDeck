/**
 * HOOK-04: Tool guard — blocks dangerous operations
 * Pattern matching on tool arguments to prevent destructive commands.
 * D-04: pure string.includes() matching, no path filtering, no regex/glob.
 * Also enforces architectural constraints from .codebase/CONSTRAINTS.md.
 * To enable: set FLOWDECK_TOOL_GUARD_ENABLED=on. Default is OFF.
 */

const IS_ENABLED = () => process.env.FLOWDECK_TOOL_GUARD_ENABLED === "on"

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"
import { readPlanningState } from "../tools/planning-state-lib"

const BLOCKED_PATTERNS = {
  read: [".env", ".pem", ".key", ".secret"],
  write: ["node_modules"],
  bash: ["rm -rf"],
}

export type BlockReason = string | null

/**
 * Check if a tool operation should be blocked.
 * Returns error message if blocked, null if allowed.
 */
export function isBlocked(tool: string, args: any): BlockReason {
  const patterns = BLOCKED_PATTERNS[tool as keyof typeof BLOCKED_PATTERNS]
  if (!patterns) return null

  if (tool === "bash") {
    const cmd = args.command as string
    if (!cmd) return null
    for (const p of patterns) {
      if (cmd.includes(p)) {
        return `FLOWDECK: Command containing "${p}" is blocked.`
      }
    }
    return null
  }

  if (tool === "read") {
    const filePath = args.filePath as string
    if (!filePath) return null
    for (const p of patterns) {
      if (filePath.includes(p)) {
        return `FLOWDECK: Access to "${p}" files is blocked.`
      }
    }
    return null
  }

  if (tool === "write") {
    const filePath = args.filePath as string
    if (!filePath) return null
    for (const p of patterns) {
      if (filePath.includes(p)) {
        return `FLOWDECK: Writing to "${p}" is blocked.`
      }
    }
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
    // Phases: 1=discuss, 2=plan, 3=execute, 4=review
    // Block write/edit if in phase 1 or 2
    if (state.phase > 0 && state.phase < 3) {
      return `FLOWDECK [phase-gate]: writing to codebase is blocked in phase ${state.phase} (${state.phase === 1 ? "discuss" : "plan"}). Run /fd-plan --confirm to enter execute phase.`
    }
  } catch {
    // If STATE.md doesn't exist or is invalid, don't block
  }
  return null
}

/**
 * HOOK-04: Tool guard hook
 * Called on tool.execute.before for all tools.
 * Blocks dangerous read/write/bash/edit operations, arch-constraint violations, and premature implementation.
 */
export async function toolGuardHook(
  ctx: { directory: string },
  input: { tool: string },
  output: { args: any }
): Promise<void> {
  if (!IS_ENABLED()) return

  // Check known dangerous tools including edit
  if (input.tool !== "bash" && input.tool !== "read" && input.tool !== "write" && input.tool !== "edit") {
    return
  }

  const blockReason = isBlocked(input.tool, output.args)
  if (blockReason) {
    throw new Error(blockReason)
  }

  // Phase & Arch-constraint check on write/edit
  if (input.tool === "write" || input.tool === "edit") {
    // 1. Phase enforcement
    const phaseBlock = checkPhaseEnforcement(ctx.directory)
    if (phaseBlock) {
      throw new Error(phaseBlock)
    }

    // 2. Arch-constraint check
    const filePath: string = output.args?.filePath ?? output.args?.path ?? ""
    const constraintBlock = checkArchConstraint(ctx.directory, filePath)
    if (constraintBlock) {
      throw new Error(constraintBlock)
    }
  }
}