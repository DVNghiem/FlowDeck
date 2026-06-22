/**
 * Canonical Planning Path Service
 *
 * Encourages `.planning/phases/phase-N/PLAN.md` as the canonical plan path.
 * Legacy root `.planning/PLAN.md` reads are supported with a warning; writes
 * are redirected to the canonical phase path when safe.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { dirname } from "path"
import { legacyPlanPath, phasePlanPath, readPlanningState } from "../tools/planning-state-lib"

export interface PlanPathResolution {
  path: string
  source: "canonical" | "legacy"
  warning?: string
}

export function resolveCanonicalPlanPath(directory: string, phase: number): PlanPathResolution {
  const canonical = phasePlanPath(directory, phase)
  if (existsSync(canonical)) {
    return { path: canonical, source: "canonical" }
  }
  const legacy = legacyPlanPath(directory)
  if (existsSync(legacy)) {
    return { path: legacy, source: "legacy", warning: `legacy plan at ${legacy}; migrate to ${canonical}` }
  }
  return { path: canonical, source: "canonical" }
}

export function readPlanCanonical(directory: string, phase: number): { content: string; resolution: PlanPathResolution } {
  const resolution = resolveCanonicalPlanPath(directory, phase)
  const content = existsSync(resolution.path) ? readFileSync(resolution.path, "utf-8") : ""
  return { content, resolution }
}

export function writePlanCanonical(
  directory: string,
  phase: number,
  content: string,
  opts: { allowLegacy?: boolean } = {},
): PlanPathResolution {
  const canonical = phasePlanPath(directory, phase)
  if (existsSync(canonical) || !opts.allowLegacy) {
    const dir = dirname(canonical)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(canonical, content, "utf-8")
    return { path: canonical, source: "canonical" }
  }
  const legacy = legacyPlanPath(directory)
  writeFileSync(legacy, content, "utf-8")
  return { path: legacy, source: "legacy", warning: `wrote legacy plan at ${legacy}; prefer ${canonical}` }
}

/**
 * Returns true if the active state points to a phase with a canonical plan path
 * and that path exists.
 */
export function isPlanCanonical(directory: string): boolean {
  try {
    const state = readPlanningState(directory)
    const phase = state.phase || 1
    const canonical = phasePlanPath(directory, phase)
    return existsSync(canonical)
  } catch {
    return false
  }
}
