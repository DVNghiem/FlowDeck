/**
 *
 * Enforces a test-first workflow for coder agents:
 * 1. RED    — write a failing test
 * 2. GREEN  — write minimal production code to pass
 * 3. REFACTOR — improve without changing behavior
 *
 * The guard gates *presence* of a test file in the same step, not test
 * execution. Test-outcome enforcement is out of scope.
 *
 * the unit contract only.
 *
 * @see docs/superpowers/specs/2026-07-15-tdd-guard-phase3-design.md
 */

/**
 * Per-step record of files that have been recorded via `recordStepWrite`
 * (or implicitly via `checkTddGuard` returning `allowed: true`).
 *
 * Keyed by `stepId`. Process-local; not persisted.
 */
const writesByStep = new Map<string, Set<string>>()

/**
 * Returns true iff `filePath` matches the strict "test file" predicate:
 *   - basename matches `*.test.*` or `*.spec.*`, OR
 *   - any path segment is exactly `tests` or `__tests__`.
 *
 * Normalizes leading `./` and converts `\` to `/` so Windows-style paths
 * also classify correctly.
 */
function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "")
  const basename = normalized.split("/").pop() ?? ""
  if (/\.(test|spec)\.[^/]+$/.test(basename)) return true
  if (/(^|\/)(__tests__|tests)\//.test(normalized)) return true
  return false
}

/**
 * Result envelope for guard decisions. Same shape as
 * `src/hooks/guard.ts#GuardResult`.
 */
export interface TddGuardResult {
  allowed: boolean
  reason?: string
}

/**
 * Decide whether `isCoderAgent` is allowed to write `filePath` for `stepId`.
 *
 * Rules:
 *   - non-coders are never gated → allowed
 *   - test files (per `isTestFile`) are always allowed, even with an empty tracker
 *   - coders writing a non-test file in a step with no recorded test file → blocked
 *
 * Returns `{ allowed: false, reason }` with a reason that begins with
 * `[TDD Guard]` when blocking, so callers can render the message verbatim.
 */
export function checkTddGuard(
  stepId: string,
  filePath: string,
  isCoderAgent: boolean
): TddGuardResult {
  if (!isCoderAgent) return { allowed: true }

  if (isTestFile(filePath)) {
    recordStepWrite(stepId, filePath)
    return { allowed: true }
  }

  const recorded = writesByStep.get(stepId)
  const hasTestRecorded =
    recorded !== undefined &&
    Array.from(recorded).some((path) => isTestFile(path))

  if (hasTestRecorded) {
    recordStepWrite(stepId, filePath)
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `[TDD Guard] Coder must write a test before '${filePath}'. Add a *.test.* or *.spec.* file (or a file under tests/ or __tests__/) in this step first.`,
  }
}

/**
 * Record that `filePath` was written for `stepId`. Idempotent.
 *
 * Callers should invoke this after a successful write so the tracker
 * reflects the file's existence for subsequent `checkTddGuard` calls.
 */
export function recordStepWrite(stepId: string, filePath: string): void {
  let set = writesByStep.get(stepId)
  if (set === undefined) {
    set = new Set<string>()
    writesByStep.set(stepId, set)
  }
  set.add(filePath)
}

/**
 * Clear all recorded writes for `stepId`. Call when a step ends so the
 * tracker does not leak into subsequent steps.
 */
export function clearStepWrites(stepId: string): void {
  writesByStep.delete(stepId)
}
