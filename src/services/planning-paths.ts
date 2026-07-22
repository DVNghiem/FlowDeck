/**
 * Canonical Planning Path Service
 *
 * The canonical plan path is `~/.fd-plan/<slug>/<topic>/plan.md`. Topics are
 * created by `/fd-task`; every later command in the pipeline reads and writes
 * through this service so the layout stays in one place.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { dirname } from "path"
import { readPlanningState, resolveActiveTopic, topicPlanPath } from "../tools/planning-state-lib"

export interface PlanPathResolution {
  path: string
  source: "canonical"
}

export function resolveCanonicalPlanPath(directory: string, topic: string): PlanPathResolution {
  return { path: topicPlanPath(directory, topic), source: "canonical" }
}

export function readPlanCanonical(
  directory: string,
  topic: string,
): { content: string; resolution: PlanPathResolution } {
  const resolution = resolveCanonicalPlanPath(directory, topic)
  const content = existsSync(resolution.path) ? readFileSync(resolution.path, "utf-8") : ""
  return { content, resolution }
}

export function writePlanCanonical(directory: string, topic: string, content: string): PlanPathResolution {
  const resolution = resolveCanonicalPlanPath(directory, topic)
  const dir = dirname(resolution.path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(resolution.path, content, "utf-8")
  return resolution
}

/**
 * Returns true if the active topic recorded in STATE.md has a plan on disk.
 */
export function isPlanCanonical(directory: string): boolean {
  try {
    const topic = resolveActiveTopic(directory, readPlanningState(directory))
    if (!topic) return false
    return existsSync(topicPlanPath(directory, topic))
  } catch {
    return false
  }
}
