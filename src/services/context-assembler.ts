/**
 * Context Assembler Service
 *
 * Builds minimal, stage-specific context objects from STATE.md and CODEBASE_INDEX.md.
 * Prevents full-document injection into every model call — instead exposes only the
 * fields relevant to the current workflow stage.
 *
 * Cache-validity is keyed on `summaryVersion` (monotonically incremented on write),
 * not on wall-clock time, so context never goes stale silently.
 */
import { readFileSync, existsSync } from "fs"
import { readCodebaseIndex } from "../tools/codebase-index"
import { statePath } from "../tools/planning-state-lib"
import { parseState } from "../tools/planning-state-lib"

export interface StageContext {
  stage: string
  /** Concise human-readable summary for injection into model prompts */
  compact_summary: string
  /** Current state version — for cache invalidation */
  state_version: number
  /** Current codebase index version — for cache invalidation */
  index_version: number
  /** Structured fields relevant to this stage */
  fields: Record<string, unknown>
  /** Was this loaded from cache (same summaryVersions as last call)? */
  from_cache: boolean
}

interface VersionedCache {
  state_version: number
  index_version: number
  context: StageContext
}

/** In-memory cache keyed by `stage + dir`. Evicted on version change. */
const _cache = new Map<string, VersionedCache>()

/** Returns only the STATE.md fields needed for the given stage. */
function selectStateFields(state: Record<string, unknown>, stage: string): Record<string, unknown> {
  const always = {
    phase: state.phase,
    status: state.status,
    last_action: state.last_action,
    next_action: state.next_action,
    blockers: state.blockers,
    summaryVersion: state.summaryVersion,
  }

  const byStage: Record<string, (keyof typeof state)[]> = {
    discuss: ["task_type", "blockers", "plan_confirmed"],
    plan: ["task_type", "requires_design_first", "steps_pending", "steps_complete", "plan_confirmed", "blockers"],
    design: ["requires_design_first", "design_stage", "design_approved", "design_artifact"],
    execute: ["steps_pending", "steps_complete", "task_type"],
    verify: ["steps_complete", "steps_pending", "tdd"],
    "fix-bug": ["task_type", "steps_pending", "steps_complete"],
    "write-docs": ["task_type", "steps_complete"],
  }

  const extra: Record<string, unknown> = {}
  for (const key of byStage[stage] ?? []) {
    if (state[key] !== undefined) extra[key] = state[key]
  }

  return { ...always, ...extra }
}

/** Returns only the CODEBASE_INDEX fields needed for the given stage. */
function selectIndexFields(
  index: ReturnType<typeof readCodebaseIndex>,
  stage: string,
): Record<string, unknown> {
  const always = {
    summaryVersion: index.summaryVersion,
    freshnessStatus: index.freshnessStatus,
    lastUpdatedAt: index.lastUpdatedAt,
  }

  // Execute/verify need changed files; discuss/plan need a lighter slice
  if (["execute", "verify", "fix-bug"].includes(stage)) {
    return {
      ...always,
      changedFiles: index.changedFiles,
      // Only expose recent explorations (last 3)
      recentExplorations: index.explorationHistory.slice(-3).map(e => ({
        stage: e.stage,
        timestamp: e.timestamp,
        files: e.filesExplored.slice(0, 5),
      })),
    }
  }

  return always
}

function buildCompactSummary(
  stage: string,
  stateFields: Record<string, unknown>,
  indexFields: Record<string, unknown>,
): string {
  const parts: string[] = [`stage=${stage}`]

  if (stateFields.status) parts.push(`status=${stateFields.status}`)
  if (stateFields.task_type) parts.push(`type=${stateFields.task_type}`)
  if (stateFields.phase !== undefined) parts.push(`phase=${stateFields.phase}`)
  if (stateFields.plan_confirmed !== undefined) parts.push(`plan_confirmed=${stateFields.plan_confirmed}`)

  const blockers = stateFields.blockers
  if (Array.isArray(blockers) && blockers.length > 0) {
    parts.push(`blockers=[${blockers.join(", ")}]`)
  } else if (typeof blockers === "string" && blockers && blockers !== "none") {
    parts.push(`blockers=[${blockers}]`)
  }

  const nextAction = stateFields.next_action
  if (nextAction && typeof nextAction === "string" && nextAction !== "none") {
    parts.push(`next=${nextAction}`)
  }

  const changedFiles = indexFields.changedFiles
  if (Array.isArray(changedFiles) && changedFiles.length > 0) {
    parts.push(`changed_files=[${changedFiles.slice(0, 5).join(", ")}]`)
  }

  parts.push(`state_v=${stateFields.summaryVersion ?? 0}`)
  parts.push(`index_v=${indexFields.summaryVersion ?? 0}`)

  return parts.join(" | ")
}

/**
 * Assembles a minimal, stage-specific context for prompt injection.
 *
 * Uses in-memory cache keyed by (stage, dir) + (stateVersion, indexVersion).
 * Safe for concurrent readers — no file writes.
 *
 * @param dir - project root directory
 * @param stage - current workflow stage
 * @returns StageContext with compact_summary and fields
 */
export function assembleStageContext(dir: string, stage: string): StageContext {
  const index = readCodebaseIndex(dir)

  const sp = statePath(dir)
  const rawState = existsSync(sp) ? readFileSync(sp, "utf-8") : ""
  const state = rawState ? parseState(rawState) : {}

  const stateVersion = typeof state.summaryVersion === "number" ? state.summaryVersion : 0
  const indexVersion = typeof index.summaryVersion === "number" ? index.summaryVersion : 0

  const cacheKey = `${stage}::${dir}`
  const cached = _cache.get(cacheKey)
  if (
    cached &&
    cached.state_version === stateVersion &&
    cached.index_version === indexVersion
  ) {
    return { ...cached.context, from_cache: true }
  }

  const stateFields = selectStateFields(state, stage)
  const indexFields = selectIndexFields(index, stage)
  const compact_summary = buildCompactSummary(stage, stateFields, indexFields)

  const ctx: StageContext = {
    stage,
    compact_summary,
    state_version: stateVersion,
    index_version: indexVersion,
    fields: { state: stateFields, index: indexFields },
    from_cache: false,
  }

  _cache.set(cacheKey, { state_version: stateVersion, index_version: indexVersion, context: ctx })
  return ctx
}

/** Explicitly invalidate the context cache for a directory (call after state writes). */
export function invalidateContextCache(dir: string): void {
  for (const key of _cache.keys()) {
    if (key.endsWith(`::${dir}`)) _cache.delete(key)
  }
}

/** Return current cache entry count (for tests/telemetry). */
export function getContextCacheSize(): number {
  return _cache.size
}
