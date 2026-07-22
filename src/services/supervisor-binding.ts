/**
 * Supervisor Binding Service
 *
 * Programmatic governance layer that reviews existing commands and agents
 * before execution. It never invents new commands or workflows — it only
 * operates on items already registered in the system.
 *
 * Architecture:
 *   Orchestrator → [supervisor review] → proceed / block / escalate
 *
 * The supervisor is strictly read-only with respect to the registry:
 *   - It inspects what already exists
 *   - It validates policy compliance
 *   - It returns a structured decision
 *   - It NEVER creates or modifies commands or workflows
 */

import { AGENT_NAMES } from "../agents/index"
import { formatRecommendedQuestion } from "../lib/recommended-question"
import { getContract } from "./agent-contract-registry"
import { loadFlowDeckConfig } from "../config"

// ─── Registry of existing commands (source: src/commands/*.md filenames) ──────

/**
 * The canonical set of registered FlowDeck commands.
 * This list is derived from src/commands/*.md at build time and must NOT
 * be modified by the supervisor under any circumstances.
 */
export const REGISTERED_COMMANDS: readonly string[] = [
  "fd-checkpoint",
  "fd-done",
  "fd-execute",
  "fd-resume",
  "fd-review",
  "fd-status",
  "fd-task",
  "fd-verify",
] as const

/**
 * The single pipeline every task follows, in order.
 *
 * There are no workflow classes and no alternative paths. The only sanctioned
 * deviation is the trivial-task shortcut, which may skip `fd-review` and
 * `fd-verify` — see `TRIVIAL_SKIPPABLE_STAGES`.
 */
export const FD_PIPELINE: readonly string[] = [
  "fd-task",
  "fd-review",
  "fd-execute",
  "fd-verify",
  "fd-done",
] as const

/** Pipeline stages a trivial task may skip, provided the reason is logged. */
export const TRIVIAL_SKIPPABLE_STAGES: readonly string[] = ["fd-review", "fd-verify"] as const

/**
 * The canonical workflow phases. These mirror `FD_PIPELINE` without the
 * `fd-` prefix and are the only valid workflow stages in the system.
 */
export const WORKFLOW_PHASES: readonly string[] = [
  "task",
  "review",
  "execute",
  "verify",
  "done",
] as const

/**
 * Return the pipeline stage that must complete before `command` may run,
 * or `null` when `command` is the entrypoint or sits outside the pipeline.
 */
export function previousPipelineStage(command: string): string | null {
  const index = FD_PIPELINE.indexOf(command)
  if (index <= 0) return null
  return FD_PIPELINE[index - 1]
}

/** Strip the `fd-` prefix so a command name can be compared to a stage name. */
function stageName(command: string): string {
  return command.replace(/^fd-/, "")
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupervisorDecisionKind = "approve" | "revise" | "block" | "escalate"
export type SupervisorTargetType = "command" | "agent" | "workflow"
export type SupervisorReviewPhase = "preflight" | "post-stage"

export interface SupervisorDecision {
  /** Final decision */
  decision: SupervisorDecisionKind
  /** Type of the reviewed target */
  targetType: SupervisorTargetType
  /** Name of the reviewed target (exact registered name) */
  targetName: string
  /** Whether the target actually exists in the registry */
  exists: boolean
  /** Human-readable reasons for the decision */
  reasons: string[]
  /** Required inputs or stages that are absent */
  missingRequirements: string[]
  /** Risk conditions detected */
  riskFlags: string[]
  /** Changes the caller must make before proceeding (for "revise") */
  requiredChanges: string[]
  /** Approval gate status */
  approvalStatus: "approved" | "pending" | "denied" | "escalated"
  /** 0–1 confidence in the decision */
  confidenceScore: number
  /** Whether this was a preflight or post-stage review */
  reviewPhase: SupervisorReviewPhase
  /** Present when decision is 'escalate' — a recommended question for the human */
  clarificationQuestion?: string
  /** ISO timestamp */
  timestamp: string
}

export interface SupervisorContext {
  /** Task description provided by the user or orchestrator */
  taskDescription?: string
  /** Current pipeline stage at the time of review (task|review|execute|verify|done) */
  currentPhase?: string
  /** Whether this is a trivial task eligible for the fd-review/fd-verify shortcut */
  isTrivial?: boolean
  /** Logged justification when a trivial task skips a stage */
  skipReason?: string
  /** Whether required inputs have been confirmed present */
  prerequisitesMet?: boolean
  /** Specific missing inputs */
  missingInputs?: string[]
  /** Whether affect.md exists for the active topic */
  affectAnalysisPresent?: boolean
  /** Whether /fd-verify passed for the active topic */
  verificationPassed?: boolean
  /** Whether design approval is present (for UI-heavy tasks) */
  designApprovalPresent?: boolean
  /** Whether the target requires explicit human approval */
  approvalRequired?: boolean
  /** Whether human approval was granted */
  approvalGranted?: boolean
  /** Review phase: before or after execution */
  reviewPhase?: SupervisorReviewPhase
  /** Run/session IDs for telemetry */
  run_id?: string
  session_id?: string
}

export interface ResolvedSupervisorConfig {
  enabled: boolean
  mode: "advisory" | "strict"
  /** Command/agent names to gate; empty array means gate all */
  reviewedTargets: string[]
  canBlock: boolean
  confidenceThreshold: number
  postExecutionReview: boolean
}

// ─── Config resolution ────────────────────────────────────────────────────────

export function resolveSupervisorConfig(directory: string): ResolvedSupervisorConfig {
  try {
    const config = loadFlowDeckConfig(directory)
    const sup = (config as any)?.governance?.supervisor ?? {}
    return {
      enabled: sup.enabled ?? false,
      mode: sup.mode ?? "advisory",
      reviewedTargets: sup.reviewedTargets ?? [],
      canBlock: sup.canBlock ?? true,
      confidenceThreshold: sup.confidenceThreshold ?? 0.7,
      postExecutionReview: sup.postExecutionReview ?? false,
    }
  } catch {
    return {
      enabled: false,
      mode: "advisory",
      reviewedTargets: [],
      canBlock: true,
      confidenceThreshold: 0.7,
      postExecutionReview: false,
    }
  }
}

// ─── Registry lookup ──────────────────────────────────────────────────────────

export function isRegisteredCommand(name: string): boolean {
  return (REGISTERED_COMMANDS as readonly string[]).includes(name)
}

export function isRegisteredAgent(name: string): boolean {
  return (AGENT_NAMES as readonly string[]).includes(name)
}

export function isRegisteredTarget(name: string): { exists: boolean; type: SupervisorTargetType } {
  if (isRegisteredCommand(name)) return { exists: true, type: "command" }
  if (isRegisteredAgent(name)) return { exists: true, type: "agent" }
  return { exists: false, type: "agent" }
}

// ─── Policy checks ────────────────────────────────────────────────────────────

interface PolicyCheckResult {
  passed: boolean
  reasons: string[]
  riskFlags: string[]
  missingRequirements: string[]
  requiredChanges: string[]
}

function checkCommandPolicy(
  commandName: string,
  ctx: SupervisorContext,
): PolicyCheckResult {
  const reasons: string[] = []
  const riskFlags: string[] = []
  const missingRequirements: string[] = []
  const requiredChanges: string[] = []

  // Pipeline order: every stage requires the one before it to have completed.
  // Trivial tasks may skip fd-review and fd-verify, but the skip must be logged.
  const required = previousPipelineStage(commandName)
  if (required && ctx.currentPhase && ctx.currentPhase !== stageName(required)) {
    const skippable = ctx.isTrivial === true && TRIVIAL_SKIPPABLE_STAGES.includes(required)
    if (!skippable) {
      riskFlags.push(
        `${commandName} invoked at stage "${ctx.currentPhase}" — the pipeline requires "${stageName(required)}" to complete first`,
      )
      requiredChanges.push(
        `Run /${required} before /${commandName}. The pipeline is ${FD_PIPELINE.join(" → ")} and stages may not be skipped.`,
      )
    } else if (!ctx.skipReason) {
      requiredChanges.push(`Trivial-task skip of /${required} must record a reason before proceeding`)
    }
  }

  // fd-execute: affect.md drives the parallel-worktree guard and is mandatory.
  if (commandName === "fd-execute" && ctx.affectAnalysisPresent === false) {
    missingRequirements.push("affect.md (affected files, risk level, parallel safety matrix)")
    riskFlags.push("Execute invoked without an affect analysis — the parallel guard cannot run")
    requiredChanges.push("Run /fd-task first to generate affect.md")
  }

  // fd-execute: UI-heavy tasks need the design in architecture.md approved at review.
  if (commandName === "fd-execute" && ctx.isTrivial !== true) {
    const taskLower = (ctx.taskDescription ?? "").toLowerCase()
    const isUiHeavy =
      /landing page|dashboard|admin panel|website|web app|ui|ux|interface|frontend|component/.test(taskLower)
    if (isUiHeavy && ctx.designApprovalPresent === false) {
      missingRequirements.push("design approval (architecture.md must be approved at /fd-review for UI-heavy tasks)")
      riskFlags.push("UI-heavy task entering execute without design approval")
      requiredChanges.push("Approve the design in /fd-review before proceeding to execute")
    }
  }

  // fd-done: only runs after verification passed.
  if (commandName === "fd-done" && ctx.verificationPassed === false) {
    missingRequirements.push("passing /fd-verify run")
    riskFlags.push("Done invoked while verification is failing")
    requiredChanges.push("Fix the failures reported by /fd-verify, then re-run it before /fd-done")
  }

  // Approval gate
  if (ctx.approvalRequired && !ctx.approvalGranted) {
    missingRequirements.push("human approval (required for this command)")
    riskFlags.push("Approval gate not satisfied")
    requiredChanges.push("Obtain explicit human approval before proceeding")
  }

  const passed =
    missingRequirements.length === 0 &&
    riskFlags.length === 0 &&
    requiredChanges.length === 0

  if (passed) {
    reasons.push(`Command "${commandName}" passed all policy checks`)
  }

  return { passed, reasons, riskFlags, missingRequirements, requiredChanges }
}

function checkAgentPolicy(
  agentName: string,
  ctx: SupervisorContext,
): PolicyCheckResult {
  const reasons: string[] = []
  const riskFlags: string[] = []
  const missingRequirements: string[] = []
  const requiredChanges: string[] = []

  const contract = getContract(agentName)
  if (!contract) {
    riskFlags.push(`Agent "${agentName}" has no registered capability contract`)
    return { passed: false, reasons, riskFlags, missingRequirements, requiredChanges }
  }

  // Missing inputs check
  if (ctx.missingInputs && ctx.missingInputs.length > 0) {
    for (const missing of ctx.missingInputs) {
      const isRequired = contract.requiredInputs.some(r =>
        r.toLowerCase().includes(missing.toLowerCase()) ||
        missing.toLowerCase().includes(r.toLowerCase())
      )
      if (isRequired) {
        missingRequirements.push(missing)
        requiredChanges.push(`Provide "${missing}" before delegating to ${agentName}`)
      }
    }
  }

  // Approval gate
  if (ctx.approvalRequired && !ctx.approvalGranted) {
    const needsApproval = contract.escalationConditions.some(c =>
      c.toLowerCase().includes("approval") || c.toLowerCase().includes("approve")
    )
    if (needsApproval) {
      missingRequirements.push("human approval")
      riskFlags.push(`Agent "${agentName}" requires approval via escalation condition`)
      requiredChanges.push("Obtain explicit human approval before proceeding")
    }
  }

  // frontend-coder: UI-heavy work requires an approved design handoff
  if (agentName === "frontend-coder") {
    const taskLower = (ctx.taskDescription ?? "").toLowerCase()
    const isUiHeavy =
      /landing page|dashboard|admin panel|website|web app|ui|ux|interface|frontend|component/.test(taskLower)
    if (isUiHeavy && ctx.designApprovalPresent === false) {
      missingRequirements.push("design handoff approval")
      riskFlags.push("frontend-coder invoked for UI-heavy task without approved design handoff")
      requiredChanges.push("Approve the design in /fd-review before delegating to frontend-coder")
    }
  }

  const passed =
    missingRequirements.length === 0 &&
    riskFlags.length === 0

  if (passed) {
    reasons.push(`Agent "${agentName}" passed all policy checks`)
  }

  return { passed, reasons, riskFlags, missingRequirements, requiredChanges }
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function computeConfidence(
  exists: boolean,
  policyResult: PolicyCheckResult,
  ctx: SupervisorContext,
): number {
  if (!exists) return 0.0
  if (policyResult.riskFlags.length >= 3) return 0.2
  if (policyResult.riskFlags.length === 2) return 0.4
  if (policyResult.riskFlags.length === 1) return 0.6
  if (policyResult.missingRequirements.length > 0) return 0.5
  if (ctx.prerequisitesMet === false) return 0.45
  return 0.95
}

// ─── Decision resolution ──────────────────────────────────────────────────────

function resolveDecision(
  exists: boolean,
  policyResult: PolicyCheckResult,
  confidenceScore: number,
  threshold: number,
  ctx: SupervisorContext,
  clarificationQuestion?: string,
): { decision: SupervisorDecisionKind; approvalStatus: SupervisorDecision["approvalStatus"]; clarificationQuestion?: string } {
  if (!exists) {
    return { decision: "block", approvalStatus: "denied" }
  }

  if (ctx.approvalRequired && !ctx.approvalGranted) {
    return { decision: "escalate", approvalStatus: "escalated", clarificationQuestion }
  }

  if (!policyResult.passed) {
    if (policyResult.requiredChanges.length > 0) {
      return { decision: "revise", approvalStatus: "pending" }
    }
    return { decision: "block", approvalStatus: "denied" }
  }

  if (confidenceScore < threshold) {
    return { decision: "escalate", approvalStatus: "escalated", clarificationQuestion }
  }

  return { decision: "approve", approvalStatus: "approved" }
}

// ─── Main review function ─────────────────────────────────────────────────────

/**
 * Run a supervisor review on an existing command or agent before execution.
 *
 * Returns a structured SupervisorDecision. In "advisory" mode the caller may
 * proceed even on a "block" decision (it should log the decision). In "strict"
 * mode the caller must honour "block" and "escalate".
 *
 * The supervisor NEVER creates a new command or workflow. If the target does
 * not exist, it returns decision="block" with exists=false and explains that
 * the requested target is not registered.
 */
export function runSupervisorReview(
  directory: string,
  targetName: string,
  ctx: SupervisorContext = {},
  clarificationQuestion?: string,
): SupervisorDecision {
  const config = resolveSupervisorConfig(directory)
  const reviewPhase = ctx.reviewPhase ?? "preflight"
  const timestamp = new Date().toISOString()

  // Determine if this target should be reviewed at all
  if (
    config.reviewedTargets.length > 0 &&
    !config.reviewedTargets.includes(targetName)
  ) {
    // Target not in the gated list — auto-approve without checks
    return {
      decision: "approve",
      targetType: "agent",
      targetName,
      exists: true,
      reasons: [`Target "${targetName}" is not in the reviewed targets list — auto-approved`],
      missingRequirements: [],
      riskFlags: [],
      requiredChanges: [],
      approvalStatus: "approved",
      confidenceScore: 1.0,
      reviewPhase,
      timestamp,
    }
  }

  const { exists, type: targetType } = isRegisteredTarget(targetName)

  if (!exists) {
    const decision: SupervisorDecision = {
      decision: "block",
      targetType,
      targetName,
      exists: false,
      reasons: [
        `Target "${targetName}" is not registered in the FlowDeck command or agent registry.`,
        "The supervisor does not create new commands or workflows.",
        "Only registered targets can be executed.",
      ],
      missingRequirements: [],
      riskFlags: [`Unregistered target: "${targetName}"`],
      requiredChanges: [
        `Use one of the registered commands: ${REGISTERED_COMMANDS.join(", ")}`,
        `Or use one of the registered agents: ${(AGENT_NAMES as readonly string[]).join(", ")}`,
      ],
      approvalStatus: "denied",
      confidenceScore: 0.0,
      reviewPhase,
      timestamp,
    }
    return decision
  }

  const policyResult =
    targetType === "command"
      ? checkCommandPolicy(targetName, ctx)
      : checkAgentPolicy(targetName, ctx)

  const confidenceScore = computeConfidence(exists, policyResult, ctx)
  const { decision, approvalStatus, clarificationQuestion: escalationQuestion } = resolveDecision(
    exists,
    policyResult,
    confidenceScore,
    config.confidenceThreshold,
    ctx,
    clarificationQuestion,
  )

  const reasons = policyResult.reasons.length > 0
    ? policyResult.reasons
    : decision === "approve"
    ? [`Target "${targetName}" reviewed and approved for execution`]
    : [`Target "${targetName}" reviewed — decision: ${decision}`]

  const supervisorDecision: SupervisorDecision = {
    decision,
    targetType,
    targetName,
    exists,
    reasons,
    missingRequirements: policyResult.missingRequirements,
    riskFlags: policyResult.riskFlags,
    requiredChanges: policyResult.requiredChanges,
    approvalStatus,
    confidenceScore,
    reviewPhase,
    timestamp,
    ...(escalationQuestion ? { clarificationQuestion: escalationQuestion } : {}),
  }

  return supervisorDecision
}

/**
 * Shorthand: should execution proceed given a decision and the current config mode?
 * In "advisory" mode, only "block" with a missing-existence check is hard-stopped.
 * In "strict" mode, "block" and "escalate" both halt execution.
 */
export function shouldProceed(
  decision: SupervisorDecision,
  mode: "advisory" | "strict",
  canBlock: boolean,
): boolean {
  if (!decision.exists) return false // always hard-stop on unregistered targets

  if (!canBlock) return true // canBlock=false makes supervisor purely advisory

  if (mode === "strict") {
    return decision.decision === "approve" || decision.decision === "revise"
  }

  // advisory: only block when confidence is very low or target doesn't exist
  return decision.decision !== "block" || decision.confidenceScore > 0.3
}
