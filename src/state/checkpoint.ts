import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs"
import { join } from "path"
import type { CheckpointState } from "../types"

const PLAN_DIR = ".fd-plan"

/** Save checkpoint to .fd-plan/<slug>/.checkpoint */
export function saveCheckpoint(root: string, slug: string, state: CheckpointState): void {
  const checkpointPath = join(root, PLAN_DIR, slug, ".checkpoint")
  writeFileSync(checkpointPath, JSON.stringify(state, null, 2), "utf-8")
}

/** Load checkpoint. Returns null if not found. */
export function loadCheckpoint(root: string, slug: string): CheckpointState | null {
  const checkpointPath = join(root, PLAN_DIR, slug, ".checkpoint")
  if (!existsSync(checkpointPath)) return null
  try {
    const content = readFileSync(checkpointPath, "utf-8")
    return JSON.parse(content) as CheckpointState
  } catch {
    return null
  }
}

/** Delete checkpoint after successful resume or ship */
export function clearCheckpoint(root: string, slug: string): void {
  const checkpointPath = join(root, PLAN_DIR, slug, ".checkpoint")
  if (existsSync(checkpointPath)) {
    unlinkSync(checkpointPath)
  }
}
