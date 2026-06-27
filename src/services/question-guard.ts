/**
 * Question Guard Service
 *
 * Prevents redundant or unnecessary questions from being emitted to the user.
 *
 * The orchestrator and /fd-discuss use this guard before forwarding any
 * clarifying question to @supervisor. Worker agents MUST NOT call ask_user
 * directly — they check this guard first, and if the answer exists in repo
 * evidence or session history, the question is dropped.
 *
 * Contract:
 *   1. createQuestionGuard(history?)    → QuestionGuard instance
 *   2. guard.check(question, evidence)  → CheckResult
 *   3. guard.record(question)           → void
 *   4. guard.getAsked()                 → string[]
 *
 * Only questions that pass the guard should be forwarded to @supervisor.
 * @supervisor asks the human. Worker agents never ask the human directly.
 */

import type { ExplorationResult } from "./preflight-explorer"
import { canAnswerFromEvidence, shouldSuppressQuestion } from "./preflight-explorer"
import type { RecommendedQuestion } from "../lib/recommended-question"
import { validateRecommendedQuestion, parseQuestionBlocks } from "../lib/recommended-question"

export interface CheckResult {
  /** Whether the question should be allowed through to @supervisor */
  allow: boolean
  /** Reason the question was blocked (when allow=false) */
  blockReason?: string
  /** Whether the block was due to repo evidence answering it */
  answeredByEvidence?: boolean
  /** Whether the block was due to a duplicate question */
  duplicate?: boolean
  /** Field names missing from the question block (when allow=false due to missing recommendation) */
  missingRecommendationFields?: string[]
  /** Hint for how to rewrite a bare question into a recommended question */
  rewriteHint?: string
}

export interface QuestionGuard {
  /**
   * Check whether a question should be forwarded to @supervisor.
   *
   * Returns allow=true only when:
   *   - The question has not been asked before in this session
   *   - The question cannot be answered from repo evidence
   *   - The question is not trivially implied by known state
   */
  check(question: string, exploration: ExplorationResult | null): CheckResult
  /**
   * Record that a question was asked. Call this after forwarding to @supervisor
   * so future identical questions are suppressed.
   */
  record(question: string): void
  /** Return all questions recorded in this guard instance. */
  getAsked(): string[]
  /** Reset the guard (for new session/run). */
  reset(): void
}

/**
 * Create a QuestionGuard.
 *
 * @param initialHistory - Questions already asked in this session (for
 *   persistence across restarts). Pass an empty array for new sessions.
 */
export function createQuestionGuard(initialHistory: string[] = []): QuestionGuard {
  const asked = new Set<string>(initialHistory.map(q => normalise(q)))

  return {
    check(question: string, exploration: ExplorationResult | null): CheckResult {
      const norm = normalise(question)

      // Check duplicate FIRST — fastest check, no I/O
      if (asked.has(norm)) {
        return {
          allow: false,
          blockReason: "This question was already asked in the current session.",
          duplicate: true,
        }
      }

      // Check evidence suppression BEFORE format validation so that genuine
      // domain questions (bare format) can still reach @supervisor
      if (exploration !== null) {
        const suppress = shouldSuppressQuestion(question, exploration, [...asked])
        if (suppress.suppress) {
          return {
            allow: false,
            blockReason: suppress.reason,
            answeredByEvidence: true,
          }
        }
      }

      // Validate that the question block has required recommendation fields.
      // This is a soft requirement — we allow bare questions through as long
      // as they cannot be answered from repo evidence. Only structured questions
      // that CAN be answered from evidence need full validation.
      const parsed = parseQuestionBlocks(question)
      if (parsed === null) {
        // Bare question — check whether evidence could have answered it.
        // If the same question was already suppressible, block it.
        // Otherwise let it through to @supervisor (they can ask the human).
        if (exploration !== null) {
          const suppress = shouldSuppressQuestion(question, exploration, [...asked])
          if (suppress.suppress) {
            return {
              allow: false,
              blockReason: suppress.reason,
              answeredByEvidence: true,
            }
          }
        }
        // Bare question that evidence cannot answer — pass through
        return {
          allow: true,
          rewriteHint: "Consider formatting as RecommendedQuestion for faster processing: Question: <your question>\nRecommendation: <your answer>\nRationale: <why this answer>\nDefault if no response: <default action>",
        }
      }

      if (!validateRecommendedQuestion(parsed)) {
        const missing: string[] = []
        const p = parsed as RecommendedQuestion
        if (!p.question) missing.push("question")
        if (!p.recommendation) missing.push("recommendation")
        if (!p.rationale) missing.push("rationale")
        if (!p.defaultIfNoResponse) missing.push("defaultIfNoResponse")

        return {
          allow: false,
          blockReason: "Question is missing required recommendation fields.",
          missingRecommendationFields: missing,
          rewriteHint: `Missing: ${missing.join(", ")}. Add these fields and try again.`,
        }
      }

      return { allow: true }
    },

    record(question: string): void {
      asked.add(normalise(question))
    },

    getAsked(): string[] {
      return [...asked]
    },

    reset(): void {
      asked.clear()
      for (const q of initialHistory) asked.add(normalise(q))
    },
  }
}

/**
 * Convenience: check a list of candidate questions and return only those
 * that should be forwarded to @supervisor. Records allowed questions.
 */
export function filterQuestions(
  candidates: string[],
  guard: QuestionGuard,
  exploration: ExplorationResult | null,
): string[] {
  return candidates.filter(q => {
    const result = guard.check(q, exploration)
    if (result.allow) {
      guard.record(q)
      return true
    }
    return false
  })
}

/**
 * Determine whether supervisor clarification is warranted at all.
 * Returns false when:
 *   - No questions remain after evidence filtering
 *   - All questions were answered by the exploration result
 *
 * Call this before invoking @supervisor to avoid empty escalations.
 */
export function needsSupervisorClarification(
  questions: string[],
  guard: QuestionGuard,
  exploration: ExplorationResult | null,
): boolean {
  const allowed = filterQuestions(questions, guard, exploration)
  return allowed.length > 0
}

function normalise(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Strict check for worker agents (coder, planner, tester, etc.).
 *
 * Worker agents MUST NOT ask the human directly. They must either:
 *   a) use repo evidence (this returns { canProceed: true, evidence })
 *   b) report missing data to orchestrator/supervisor
 *
 * This function decides which path to take.
 */
export interface WorkerAgentDecision {
  /** True when the worker can proceed using evidence alone */
  canProceed: boolean
  /** True when the worker must stop and report missing data upward */
  mustEscalate: boolean
  /** Evidence that allows the worker to proceed (when canProceed=true) */
  evidence?: string
  /** What data is missing (when mustEscalate=true) */
  missingData?: string
}

export function workerAgentDecision(
  requiredInfo: string,
  exploration: ExplorationResult,
): WorkerAgentDecision {
  if (canAnswerFromEvidence(requiredInfo, exploration)) {
    const match = exploration.evidenceItems.find(e => {
      const lower = requiredInfo.toLowerCase()
      return e.summary.toLowerCase().includes(lower.split(" ")[0]) ||
        lower.includes(e.answersQuestion.replace(/-/g, " "))
    })
    return {
      canProceed: true,
      mustEscalate: false,
      evidence: match?.summary,
    }
  }

  return {
    canProceed: false,
    mustEscalate: true,
    missingData: requiredInfo,
  }
}
