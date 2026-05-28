/**
 * Draft Verifier
 *
 * Implements draft-then-verify for agent calls. A cheap draft is checked
 * against deterministic verifiers before deciding whether to escalate to
 * an expensive model call.
 *
 * PHASE 1: Only rule-based (deterministic) verifiers are supported.
 * Model-based verification is explicitly excluded to avoid turning 1 call into 2.
 *
 * Usage pattern:
 *   1. Run cheap/draft agent → get draft response
 *   2. Call verifyDraft(draft, verifiers)
 *   3. If decision.accepted → return draft, skip expensive agent
 *   4. If !decision.accepted → call expensive agent
 */

export type BuiltinVerifierType =
  | "min_length"
  | "is_json"
  | "contains_key"
  | "matches_regex"
  | "is_nonempty"
  | "no_error_markers"

export interface BuiltinVerifier {
  type: BuiltinVerifierType
  /** min_length: minimum character count after trimming */
  min_chars?: number
  /** contains_key: substring that must appear in the response */
  required_key?: string
  /** matches_regex: regex pattern string */
  pattern?: string
}

export interface VerificationResult {
  passed: boolean
  verifier: BuiltinVerifierType
  reason: string
}

export interface DraftVerifyDecision {
  /** True if all verifiers passed and the draft is acceptable. */
  accepted: boolean
  verifications: VerificationResult[]
  failures: number
}

/** Phrases that indicate a draft failed to produce useful output. */
const ERROR_MARKERS = [
  "i cannot",
  "i can't",
  "i'm unable",
  "i am unable",
  "error:",
  "failed:",
  "exception:",
  "traceback",
  "no such file",
  "not found",
  "undefined is not",
]

/**
 * Run all verifiers against a draft response.
 * ALL verifiers must pass for the draft to be accepted.
 */
export function verifyDraft(draft: string, verifiers: BuiltinVerifier[]): DraftVerifyDecision {
  const verifications = verifiers.map(v => runVerifier(draft, v))
  const failures = verifications.filter(v => !v.passed).length
  return { accepted: failures === 0, verifications, failures }
}

function runVerifier(draft: string, verifier: BuiltinVerifier): VerificationResult {
  switch (verifier.type) {
    case "min_length": {
      const min = verifier.min_chars ?? 1
      const len = draft.trim().length
      const passed = len >= min
      return {
        passed,
        verifier: verifier.type,
        reason: passed ? `length ${len} >= ${min}` : `length ${len} < ${min}`,
      }
    }

    case "is_json": {
      try {
        JSON.parse(draft.trim())
        return { passed: true, verifier: verifier.type, reason: "valid JSON" }
      } catch (e) {
        return {
          passed: false,
          verifier: verifier.type,
          reason: `invalid JSON: ${(e as Error).message}`,
        }
      }
    }

    case "contains_key": {
      const key = verifier.required_key ?? ""
      const passed = key.length > 0 && draft.includes(key)
      return {
        passed,
        verifier: verifier.type,
        reason: passed ? `found key "${key}"` : `missing key "${key}"`,
      }
    }

    case "matches_regex": {
      try {
        const regex = new RegExp(verifier.pattern ?? "")
        const passed = regex.test(draft)
        return {
          passed,
          verifier: verifier.type,
          reason: passed
            ? `matches /${verifier.pattern}/`
            : `does not match /${verifier.pattern}/`,
        }
      } catch {
        return {
          passed: false,
          verifier: verifier.type,
          reason: `invalid regex pattern: ${verifier.pattern}`,
        }
      }
    }

    case "is_nonempty": {
      const passed = draft.trim().length > 0
      return { passed, verifier: verifier.type, reason: passed ? "non-empty" : "empty response" }
    }

    case "no_error_markers": {
      const lower = draft.toLowerCase()
      const found = ERROR_MARKERS.find(m => lower.includes(m))
      return {
        passed: !found,
        verifier: verifier.type,
        reason: found ? `contains error marker: "${found}"` : "no error markers found",
      }
    }

    default:
      return {
        passed: false,
        verifier: (verifier as BuiltinVerifier).type,
        reason: "unknown verifier type",
      }
  }
}

/**
 * Return a default set of verifiers for a given task output type.
 * Use as a starting point — callers can extend or replace.
 */
export function defaultVerifiers(
  taskType: "json_response" | "prose_response" | "classification",
): BuiltinVerifier[] {
  switch (taskType) {
    case "json_response":
      return [
        { type: "is_nonempty" },
        { type: "is_json" },
        { type: "no_error_markers" },
      ]
    case "classification":
      return [
        { type: "is_nonempty" },
        { type: "min_length", min_chars: 5 },
        { type: "no_error_markers" },
      ]
    case "prose_response":
    default:
      return [
        { type: "is_nonempty" },
        { type: "min_length", min_chars: 50 },
        { type: "no_error_markers" },
      ]
  }
}
