/**
 * Codebase state helpers for project-level metadata.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { CodebaseState } from "../types/state"

const PLAN_DIR = ".fd-plan"
const CODEBASE_FILE = ".codebase.json"

/**
 * Read the cached CodebaseState for the project.
 * Returns null if the project has not been indexed yet.
 */
export function readCodebaseState(root: string): CodebaseState | null {
  const path = join(root, PLAN_DIR, CODEBASE_FILE)
  if (!existsSync(path)) return null
  try {
    const content = readFileSync(path, "utf-8")
    return JSON.parse(content) as CodebaseState
  } catch {
    return null
  }
}

/**
 * Write the CodebaseState to .fd-plan/.codebase.json.
 * Creates .fd-plan/ if it doesn't exist.
 */
export function writeCodebaseState(root: string, state: CodebaseState): void {
  const dir = join(root, PLAN_DIR)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, CODEBASE_FILE)
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8")
}

/**
 *
 * - Detect languages via file extension scan
 * - Detect frameworks via package.json, Cargo.toml, pyproject.toml, etc.
 * - Locate CLAUDE.md and architect.md
 * - Write the result via writeCodebaseState()
 */
export async function updateCodebaseIndex(root: string): Promise<void> {
  // For now, write a minimal placeholder so readCodebaseState() succeeds
  const existing = readCodebaseState(root)
  const state: CodebaseState = {
    projectRoot: root,
    languages: existing?.languages ?? [],
    frameworks: existing?.frameworks ?? [],
    archFile: existing?.archFile,
    claudeMdPath: existing?.claudeMdPath,
    indexedAt: new Date().toISOString(),
  }
  writeCodebaseState(root, state)
}
