import type { OpencodeClient } from "@opencode-ai/sdk"
import { existsSync, mkdirSync, appendFileSync } from "fs"
import { dirname, join } from "path"

import { createAgent, type AgentDefinition } from "../agents/index"
import {
  resolveAgentModels,
  parseModelSpec,
  type FlowDeckConfig,
} from "../config/agent-models"

/** Workflow classes supported by the execution substrate. */
export const WORKFLOW_CLASSES = [
  "quick",
  "standard",
  "explore",
  "ui-heavy",
  "bugfix",
  "docs-only",
  "verify-heavy",
] as const

export type WorkflowClass = (typeof WORKFLOW_CLASSES)[number]

/** Lifecycle event statuses emitted during handoff execution. */
export type LifecycleStatus =
  | "routing_started"
  | "workflow_selected"
  | "worker_selected"
  | "handoff_payload_built"
  | "handoff_validated"
  | "handoff_invoked"
  | "worker_accepted"
  | "first_tool_started"
  | "execution_running"
  | "execution_completed"
  | "execution_blocked"
  | "execution_failed"
  | "handoff_fallback_triggered"
  | "approval_required"

/** Structured handoff payload from the orchestrator to the execution substrate. */
export interface HandoffPayload {
  workerId: string
  workflowId: WorkflowClass
  taskSummary: string
  constraints?: string[]
  targets?: string[]
  acceptanceCriteria: string[]
  budget?: {
    maxTokens?: number
    maxSteps?: number
    timeoutMs?: number
  }
  trace: {
    runId: string
    sessionId: string
    parentTraceId?: string
  }
}

/** Single lifecycle event written to logs and the events JSONL file. */
export interface LifecycleEvent {
  runId: string
  sessionId: string
  timestamp: number
  workerId: string
  workflowId: string
  status: LifecycleStatus
  error?: string
  payloadSummary?: string
}

/** Context required to hand off a task to a worker session. */
export interface DelegateContext {
  directory: string
  sessionID: string
}

/** Terminal result of a handoff() call. */
export type DelegateResult =
  | { status: "running"; childSessionId: string; message: string }
  | { status: "approval_required"; approvalId: string; message: string }
  | { status: "error"; error: string }

/** Structured validation result. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] }

/** Public execution substrate interface. */
export interface ExecutionSubstrate {
  handoff(payload: HandoffPayload, context: DelegateContext): Promise<DelegateResult>
  validate(payload: unknown): ValidationResult<HandoffPayload>
  resolveWorker(workerId: string): AgentDefinition | null
}

/** Request shape for task-level approval (wired in Phase 4). */
export interface ApprovalRequest {
  trigger: "delegate"
  payloadSummary: string
  workerId: string
  workflowId: string
}

/** Result returned by the approval callback. */
export interface TaskApprovalResult {
  approvalId: string
  status: "pending"
}

const READ_ONLY_AGENTS = new Set([
  "researcher",
  "reviewer",
  "code-explorer",
  "security-auditor",
  "debug-specialist",
  "plan-checker",
  "risk-analyst",
  "refactor-guide",
  "performance-optimizer",
])

const SENSITIVE_SEGMENTS = ["/env", "/.env", "/secrets", "/credentials", "/token", "/key"]
const SENSITIVE_EXTENSIONS = [".pem", ".key", ".env"]

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_TIMEOUT_MS = 10 * 60 * 1000
const MAX_TASK_SUMMARY_LENGTH = 2000
const HIGH_TOKEN_THRESHOLD = 100_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getEventSessionId(event: Record<string, unknown>): string | undefined {
  const props = event.properties
  if (isRecord(props)) {
    const id = props.sessionID ?? props.sessionId
    if (typeof id === "string") return id
  }
  const direct = event.sessionID ?? event.sessionId
  if (typeof direct === "string") return direct
  return undefined
}

function isSafeTargetPath(target: string): boolean {
  if (target.length === 0) return false
  if (target.startsWith("/") || target.startsWith("\\")) return false
  const normalized = target.replace(/\\/g, "/")
  return !normalized.split("/").some((part) => part === "..")
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function textPart(text: string): { type: "text"; text: string } {
  return { type: "text", text }
}

function getAgentModel(
  config: FlowDeckConfig | undefined,
  agent: string,
): { providerID: string; modelID: string } | undefined {
  if (!config) return undefined
  const models = resolveAgentModels(config)
  const spec = models[agent]
  return spec ? parseModelSpec(spec) : undefined
}

function buildHandoffPrompt(payload: HandoffPayload): string {
  const parts: string[] = []
  parts.push("# Task")
  parts.push(payload.taskSummary)

  if (payload.constraints && payload.constraints.length > 0) {
    parts.push("")
    parts.push("# Constraints")
    for (const constraint of payload.constraints) {
      parts.push(`- ${constraint}`)
    }
  }

  if (payload.targets && payload.targets.length > 0) {
    parts.push("")
    parts.push("# Targets")
    for (const target of payload.targets) {
      parts.push(`- ${target}`)
    }
  }

  parts.push("")
  parts.push("# Acceptance Criteria")
  for (const criterion of payload.acceptanceCriteria) {
    parts.push(`- ${criterion}`)
  }

  parts.push("")
  parts.push("# Trace")
  parts.push(`- runId: ${payload.trace.runId}`)
  parts.push(`- sessionId: ${payload.trace.sessionId}`)
  if (payload.trace.parentTraceId) {
    parts.push(`- parentTraceId: ${payload.trace.parentTraceId}`)
  }

  return parts.join("\n")
}

function summarizePayload(payload: HandoffPayload): string {
  const parts: string[] = []
  parts.push(`worker=${payload.workerId}`)
  parts.push(`workflow=${payload.workflowId}`)
  const summary =
    payload.taskSummary.length > 80
      ? `${payload.taskSummary.slice(0, 80)}...`
      : payload.taskSummary
  parts.push(`summary=${summary}`)
  if (payload.targets && payload.targets.length > 0) {
    parts.push(`targets=[${payload.targets.join(", ")}]`)
  }
  return parts.join(" ")
}

function pushStringArrayErrors(
  errors: string[],
  value: unknown,
  field: string,
  allowEmpty = false,
): value is string[] {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of strings`)
    return false
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      errors.push(`${field}[${i}] must be a string`)
      return false
    }
    if (!allowEmpty && (value[i] as string).length === 0) {
      errors.push(`${field}[${i}] must be a non-empty string`)
      return false
    }
  }
  return true
}

function validateWorkerId(value: unknown, errors: string[]): string {
  if (typeof value !== "string" || value.length === 0) {
    errors.push("workerId must be a non-empty string")
    return ""
  }
  if (!createAgent(value)) {
    errors.push(`workerId '${value}' is not a registered FlowDeck agent`)
    return ""
  }
  return value
}

function validateWorkflowId(value: unknown, errors: string[]): WorkflowClass | undefined {
  if (typeof value !== "string" || !WORKFLOW_CLASSES.includes(value as WorkflowClass)) {
    errors.push(`workflowId must be one of: ${WORKFLOW_CLASSES.join(", ")}`)
    return undefined
  }
  return value as WorkflowClass
}

function validateTaskSummary(value: unknown, errors: string[]): string {
  if (typeof value !== "string") {
    errors.push("taskSummary must be a string")
    return ""
  }
  if (value.length === 0 || value.length > MAX_TASK_SUMMARY_LENGTH) {
    errors.push(`taskSummary must be 1-${MAX_TASK_SUMMARY_LENGTH} characters`)
    return ""
  }
  return value
}

function validateAcceptanceCriteria(value: unknown, errors: string[]): string[] {
  const result: string[] = []
  if (
    pushStringArrayErrors(errors, value, "acceptanceCriteria", false) &&
    Array.isArray(value) &&
    value.length === 0
  ) {
    errors.push("acceptanceCriteria must be a non-empty array")
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      result.push(item as string)
    }
  }
  return result
}

function validateTargets(value: unknown, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined
  if (!pushStringArrayErrors(errors, value, "targets", true)) return undefined
  const targets = (value as string[]).slice()
  for (let i = 0; i < targets.length; i++) {
    if (!isSafeTargetPath(targets[i])) {
      errors.push(`targets[${i}] contains unsafe path segments: ${targets[i]}`)
    }
  }
  return targets
}

function validateConstraints(value: unknown, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined
  return pushStringArrayErrors(errors, value, "constraints", true)
    ? (value as string[]).slice()
    : undefined
}

function validateBudget(value: unknown, errors: string[]): HandoffPayload["budget"] {
  const result: HandoffPayload["budget"] = { timeoutMs: DEFAULT_TIMEOUT_MS }
  if (value === undefined) return result
  if (!isRecord(value)) {
    errors.push("budget must be an object")
    return result
  }

  if (value.maxTokens !== undefined && typeof value.maxTokens !== "number") {
    errors.push("budget.maxTokens must be a number")
  } else if (typeof value.maxTokens === "number") {
    result.maxTokens = value.maxTokens
  }

  if (value.maxSteps !== undefined && typeof value.maxSteps !== "number") {
    errors.push("budget.maxSteps must be a number")
  } else if (typeof value.maxSteps === "number") {
    result.maxSteps = value.maxSteps
  }

  if (value.timeoutMs !== undefined) {
    if (typeof value.timeoutMs !== "number" || value.timeoutMs <= 0) {
      errors.push("budget.timeoutMs must be a positive number")
    } else {
      result.timeoutMs = Math.min(value.timeoutMs, MAX_TIMEOUT_MS)
    }
  }

  return result
}

function validateTrace(value: unknown, errors: string[]): HandoffPayload["trace"] | undefined {
  if (!isRecord(value)) {
    errors.push("trace must be an object")
    return undefined
  }

  let runId = ""
  let sessionId = ""
  let parentTraceId: string | undefined

  if (typeof value.runId !== "string" || value.runId.length === 0) {
    errors.push("trace.runId must be a non-empty string")
  } else {
    runId = value.runId
  }

  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
    errors.push("trace.sessionId must be a non-empty string")
  } else {
    sessionId = value.sessionId
  }

  if (value.parentTraceId !== undefined) {
    if (typeof value.parentTraceId !== "string") {
      errors.push("trace.parentTraceId must be a string")
    } else {
      parentTraceId = value.parentTraceId
    }
  }

  if (runId.length === 0 || sessionId.length === 0) return undefined

  return {
    runId,
    sessionId,
    ...(parentTraceId !== undefined ? { parentTraceId } : {}),
  }
}

/** Validate a handoff payload structurally. */
export function validateHandoffPayload(payload: unknown): ValidationResult<HandoffPayload> {
  if (!isRecord(payload)) {
    return { ok: false, errors: ["Payload must be an object"] }
  }

  const errors: string[] = []
  const workerId = validateWorkerId(payload.workerId, errors)
  const workflowId = validateWorkflowId(payload.workflowId, errors)
  const taskSummary = validateTaskSummary(payload.taskSummary, errors)
  const acceptanceCriteria = validateAcceptanceCriteria(payload.acceptanceCriteria, errors)
  const constraints = validateConstraints(payload.constraints, errors)
  const targets = validateTargets(payload.targets, errors)
  const budget = validateBudget(payload.budget, errors)
  const trace = validateTrace(payload.trace, errors)

  if (errors.length > 0 || workflowId === undefined || trace === undefined) {
    return { ok: false, errors }
  }

  const validated: HandoffPayload = {
    workerId,
    workflowId,
    taskSummary,
    acceptanceCriteria,
    trace,
    budget,
  }

  if (constraints !== undefined) validated.constraints = constraints
  if (targets !== undefined) validated.targets = targets

  return { ok: true, value: validated }
}

/** Resolve a worker by registered agent name. */
export function resolveWorker(workerId: string): AgentDefinition | null {
  const agent = createAgent(workerId)
  return agent ?? null
}

function checkWorkerPermission(
  workerId: string,
  workflowId: WorkflowClass,
  targets: string[] | undefined,
): string | null {
  if (!targets || targets.length === 0) return null
  if (READ_ONLY_AGENTS.has(workerId) && workflowId !== "verify-heavy" && workflowId !== "explore") {
    return `Read-only agent '${workerId}' cannot be handed off tasks with targets unless workflowId is 'verify-heavy' or 'explore'`
  }
  return null
}

/** Invoke a worker session and return the child session id. */
export async function invokeWorker(
  payload: HandoffPayload,
  context: DelegateContext,
  client: OpencodeClient,
  getConfig?: () => FlowDeckConfig,
): Promise<string> {
  const createRes = await client.session.create({
    body: { parentID: context.sessionID, title: `handoff:${payload.workerId}` },
    query: { directory: context.directory },
  })

  if (createRes.error || !createRes.data?.id) {
    const message = createRes.error ? String(createRes.error) : "Failed to create worker session"
    throw new Error(message)
  }

  const childId = createRes.data.id
  const model = getConfig ? getAgentModel(getConfig(), payload.workerId) : undefined

  const promptRes = await client.session.promptAsync({
    path: { id: childId },
    body: {
      agent: payload.workerId,
      ...(model ? { model } : {}),
      parts: [textPart(buildHandoffPrompt(payload))],
    },
    query: { directory: context.directory },
  })

  if (promptRes.error) {
    throw new Error(String(promptRes.error))
  }

  return childId
}

/** Options for createLifecycleLogger. */
export interface LifecycleLoggerOptions {
  appLog: (msg: string) => void | Promise<void>
  directory: string
}

/** Create a lifecycle logger that writes app logs and a JSONL file. */
export function createLifecycleLogger(
  options: LifecycleLoggerOptions,
): (event: LifecycleEvent) => void {
  const { appLog, directory } = options
  const eventsPath = join(directory, ".opencode", "flowdeck-events.jsonl")

  return (event: LifecycleEvent) => {
    const line =
      `[handoff-lifecycle] ${event.status} ` +
      `runId=${event.runId} workerId=${event.workerId} workflowId=${event.workflowId}`
    Promise.resolve(appLog(line)).catch(() => {})

    try {
      const dir = dirname(eventsPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const record = {
        ...event,
        error: event.error ?? undefined,
        payloadSummary: event.payloadSummary ?? undefined,
      }
      appendFileSync(eventsPath, JSON.stringify(record) + "\n", "utf-8")
    } catch {
      // Best-effort persistence only.
    }
  }
}

/** Signal returned by watchWorkerStart. */
export interface WorkerStartSignal {
  started: boolean
  reason?: string
}

/** Watch a child session and resolve when it starts or times out. */
export async function watchWorkerStart(
  childSessionId: string,
  timeoutMs: number,
  client: OpencodeClient,
  directory: string,
): Promise<WorkerStartSignal> {
  const sub = await client.event.subscribe({ query: { directory } })
  const { stream } = sub

  return new Promise<WorkerStartSignal>((resolve) => {
    let settled = false
    let readerExited = false

    const cleanup = (): void => {
      if (readerExited) return
      readerExited = true
      try {
        const unsub = (sub as unknown as { unsubscribe?: () => void }).unsubscribe
        unsub?.()
      } catch {
        // Best-effort cleanup only.
      }
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ started: false, reason: "startup_timeout" })
    }, timeoutMs)

    function onStart(): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve({ started: true })
    }

    const reader = (async () => {
      try {
        for await (const rawEvent of stream) {
          if (readerExited) break
          const event: unknown = rawEvent
          if (!isRecord(event)) continue

          const type = event.type
          if (typeof type !== "string") continue

          const sessionId = getEventSessionId(event)
          if (sessionId !== childSessionId) continue

          if (
            type === "message.part.updated" ||
            type === "session.idle" ||
            type === "session.status" ||
            type === "tool.execute.before"
          ) {
            onStart()
            break
          }
        }
      } catch {
        // Stream ended or errored; let the timeout handle it.
      } finally {
        readerExited = true
      }
    })()

    reader.catch(() => {
      // Ignore; timeout is the fallback.
    })
  })
}

/** Determine whether a handoff requires task-level approval. */
export function requiresTaskApproval(payload: HandoffPayload): boolean {
  if (payload.workflowId === "verify-heavy") return true
  if (payload.budget?.maxTokens !== undefined && payload.budget.maxTokens > HIGH_TOKEN_THRESHOLD) {
    return true
  }
  if (payload.targets) {
    for (const target of payload.targets) {
      const lower = target.toLowerCase()
      for (const segment of SENSITIVE_SEGMENTS) {
        if (lower.includes(segment)) return true
      }
      for (const ext of SENSITIVE_EXTENSIONS) {
        if (lower.endsWith(ext)) return true
      }
    }
  }
  return false
}

function emitEvent(
  log: (event: LifecycleEvent) => void,
  payload: HandoffPayload,
  status: LifecycleStatus,
  extras?: Partial<LifecycleEvent>,
): void {
  log({
    runId: payload.trace.runId,
    sessionId: payload.trace.sessionId,
    timestamp: Date.now(),
    workerId: payload.workerId,
    workflowId: payload.workflowId,
    status,
    ...extras,
  })
}

function handleValidationFailure(
  payload: HandoffPayload | Record<string, unknown>,
  validation: { ok: false; errors: string[] },
  log: (event: LifecycleEvent) => void,
): DelegateResult {
  const workerId = isRecord(payload) && typeof payload.workerId === "string" ? payload.workerId : "unknown"
  const workflowId =
    isRecord(payload) && typeof payload.workflowId === "string" ? payload.workflowId : "unknown"
  const runId =
    isRecord(payload) && isRecord(payload.trace) && typeof payload.trace.runId === "string"
      ? payload.trace.runId
      : "unknown"
  const sessionId =
    isRecord(payload) && isRecord(payload.trace) && typeof payload.trace.sessionId === "string"
      ? payload.trace.sessionId
      : "unknown"

  const error = `Invalid handoff payload: ${validation.errors.join("; ")}`
  log({
    runId,
    sessionId,
    timestamp: Date.now(),
    workerId,
    workflowId,
    status: "execution_failed",
    error,
  })
  return { status: "error", error }
}

async function executeWorkerInvocation(
  payload: HandoffPayload,
  context: DelegateContext,
  client: OpencodeClient,
  getConfig: (() => FlowDeckConfig) | undefined,
  log: (event: LifecycleEvent) => void,
): Promise<DelegateResult> {
  emitEvent(log, payload, "handoff_invoked", {
    payloadSummary: summarizePayload(payload),
  })

  const timeoutMs = payload.budget?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const childSessionId = await invokeWorker(payload, context, client, getConfig)
  emitEvent(log, payload, "worker_accepted")

  const startSignal = await watchWorkerStart(childSessionId, timeoutMs, client, context.directory)
  if (!startSignal.started) {
    throw new Error(startSignal.reason ?? "worker failed to start")
  }

  emitEvent(log, payload, "execution_running")
  return {
    status: "running",
    childSessionId,
    message: `Delegated to @${payload.workerId}; child session ${childSessionId} is running.`,
  }
}

async function runWithFallback(
  payload: HandoffPayload,
  context: DelegateContext,
  client: OpencodeClient,
  getConfig: (() => FlowDeckConfig) | undefined,
  log: (event: LifecycleEvent) => void,
  errorMessage: string,
): Promise<DelegateResult> {
  emitEvent(log, payload, "execution_failed", { error: errorMessage })

  if (payload.workflowId !== "quick" && payload.workflowId !== "docs-only") {
    return { status: "error", error: errorMessage }
  }

  const fallbackPayload: HandoffPayload = { ...payload, workerId: "default-executor" }
  emitEvent(log, fallbackPayload, "handoff_fallback_triggered", { error: errorMessage })

  try {
    const result = await executeWorkerInvocation(fallbackPayload, context, client, getConfig, log)
    if (result.status === "running") {
      return {
        ...result,
        message: `Fallback to @default-executor; ${result.message}`,
      }
    }
    return result
  } catch (fallbackError) {
    const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
    emitEvent(log, fallbackPayload, "execution_failed", { error: message })
    return { status: "error", error: `Fallback failed: ${message}` }
  }
}

/** Create the execution substrate service. */
export function createExecutionSubstrate(
  client: OpencodeClient,
  getConfig?: () => FlowDeckConfig,
  appLog?: (msg: string) => void | Promise<void>,
  requestApproval?: (request: ApprovalRequest) => TaskApprovalResult | Promise<TaskApprovalResult>,
): ExecutionSubstrate {
  const safeAppLog = appLog ?? (() => {})

  return {
    validate: validateHandoffPayload,
    resolveWorker,
    async handoff(payload, context) {
      const log = createLifecycleLogger({ appLog: safeAppLog, directory: context.directory })

      const validation = validateHandoffPayload(payload)
      if (!validation.ok) {
        return handleValidationFailure(payload, validation, log)
      }

      const validPayload = validation.value
      emitEvent(log, validPayload, "routing_started", {
        payloadSummary: summarizePayload(validPayload),
      })
      emitEvent(log, validPayload, "workflow_selected")

      const worker = resolveWorker(validPayload.workerId)
      if (!worker) {
        const error = `Unknown worker: ${validPayload.workerId}`
        emitEvent(log, validPayload, "execution_failed", { error })
        return { status: "error", error }
      }

      emitEvent(log, validPayload, "worker_selected")

      const permissionError = checkWorkerPermission(
        validPayload.workerId,
        validPayload.workflowId,
        validPayload.targets,
      )
      if (permissionError) {
        emitEvent(log, validPayload, "execution_failed", { error: permissionError })
        return { status: "error", error: permissionError }
      }

      if (requiresTaskApproval(validPayload)) {
        const fallbackApprovalId = generateId()
        const message = `Approval required before delegating to @${validPayload.workerId} (${validPayload.workflowId}).`
        emitEvent(log, validPayload, "approval_required", {
          payloadSummary: summarizePayload(validPayload),
        })
        let approvalId = fallbackApprovalId
        if (requestApproval) {
          try {
            const result = await Promise.resolve(
              requestApproval({
                trigger: "delegate",
                payloadSummary: summarizePayload(validPayload),
                workerId: validPayload.workerId,
                workflowId: validPayload.workflowId,
              }),
            )
            approvalId = result.approvalId
          } catch {
            // Use fallback approval ID if callback throws.
          }
        }
        return { status: "approval_required", approvalId, message }
      }

      try {
        return await executeWorkerInvocation(validPayload, context, client, getConfig, log)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return runWithFallback(validPayload, context, client, getConfig, log, message)
      }
    },
  }
}
