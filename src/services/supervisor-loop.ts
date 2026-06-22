/**
 * Supervisor Loop State Machine
 *
 * Bounded background supervisor that polls session health, detects no-progress,
 * applies backoff, emits recovery actions, and reaches a terminal stop state.
 *
 * Design constraints:
 *   - Deterministic state transitions exposed for tests.
 *   - Bounded iterations and budget to prevent spam.
 *   - Terminal states stop polling.
 *   - No raw infinite loops.
 */

import { recommendRecovery, type RecoveryAction } from "./recovery-layer"
import { appendAuditEvent } from "./audit-log"
import { existsSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"

export type SupervisorState =
  | "idle"
  | "watching"
  | "no_progress"
  | "budget_exceeded"
  | "failed"
  | "stopped"

export interface SupervisorLoopConfig {
  /** Maximum polling iterations before forced stop */
  maxIterations: number
  /** Maximum total budget (arbitrary units, e.g. tool calls) */
  maxBudget: number
  /** Backoff multiplier between iterations */
  backoffMultiplier: number
  /** Initial delay between polls in ms */
  baseDelayMs: number
  /** Consecutive no-progress observations required to trigger no_progress */
  noProgressThreshold: number
}

export const DEFAULT_SUPERVISOR_LOOP_CONFIG: SupervisorLoopConfig = {
  maxIterations: 10,
  maxBudget: 50,
  backoffMultiplier: 2,
  baseDelayMs: 500,
  noProgressThreshold: 2,
}

export interface SupervisorTick {
  iteration: number
  state: SupervisorState
  budget: number
  noProgressCount: number
  delayMs: number
  action?: RecoveryAction
  reason?: string
  terminal: boolean
}

export interface SupervisorContext {
  sessionID: string
  agentName: string
  availableAgents: string[]
  directory: string
  runID?: string
}

export class SupervisorLoop {
  private config: SupervisorLoopConfig
  private state: SupervisorState = "idle"
  private iteration = 0
  private budget = 0
  private noProgressCount = 0
  private delayMs: number
  private failureCount = 0
  private ctx: SupervisorContext
  private ticks: SupervisorTick[] = []
  private recoveryEmitted = false

  constructor(ctx: SupervisorContext, config?: Partial<SupervisorLoopConfig>) {
    this.ctx = ctx
    this.config = { ...DEFAULT_SUPERVISOR_LOOP_CONFIG, ...config }
    this.delayMs = this.config.baseDelayMs
  }

  getState(): SupervisorState {
    return this.state
  }

  getTicks(): SupervisorTick[] {
    return this.ticks.slice()
  }

  /**
   * Start the bounded supervisor loop. Returns the final terminal tick.
   * The loop runs synchronously up to maxIterations to keep hook runtime bounded.
   * Emits at most one recovery action per stuck episode.
   */
  run(onProgress?: (tick: SupervisorTick) => void): SupervisorTick {
    this.state = "watching"
    while (!this.isTerminal()) {
      const tick = this.tick()
      this.ticks.push(tick)
      onProgress?.(tick)
      if (tick.terminal) break
    }
    return this.ticks[this.ticks.length - 1]
  }

  /**
   * Feed an external observation into the state machine and return the next tick.
   * Useful for hooks that observe tool outcomes without running the full loop.
   * After a recovery action is emitted, the loop stops so only one recovery
   * event is produced per stuck state.
   */
  observe(progressMade: boolean, failure = false): SupervisorTick {
    if (this.isTerminal()) {
      return this.makeTick(this.state, undefined, "terminal state — no further polling")
    }

    this.iteration++
    this.budget++

    if (failure) {
      this.failureCount++
      const recommendation = recommendRecovery(
        this.failureCount,
        this.ctx.agentName,
        "tool or agent failure observed",
        this.ctx.availableAgents,
      )
      this.logAudit("recovery.action", recommendation.action.kind, recommendation.action.reason)
      this.state = recommendation.action.kind === "stop" ? "stopped" : "stopped"
      return this.makeTick(this.state, recommendation.action, recommendation.action.reason)
    }

    if (!progressMade) {
      this.noProgressCount++
    } else {
      this.noProgressCount = 0
      this.delayMs = this.config.baseDelayMs
      this.recoveryEmitted = false
    }

    if (this.noProgressCount >= this.config.noProgressThreshold) {
      if (this.recoveryEmitted) {
        return this.makeTick("watching", undefined, "recovery already emitted — awaiting progress")
      }
      this.failureCount++
      const recommendation = recommendRecovery(
        this.failureCount,
        this.ctx.agentName,
        "no progress detected",
        this.ctx.availableAgents,
      )
      this.recoveryEmitted = true
      this.logAudit("recovery.action", recommendation.action.kind, recommendation.action.reason)
      this.state = recommendation.action.kind === "stop" ? "stopped" : "stopped"
      return this.makeTick(this.state, recommendation.action, recommendation.action.reason)
    }

    if (this.iteration >= this.config.maxIterations) {
      const action: RecoveryAction = { kind: "stop", reason: "supervisor iteration budget exceeded", terminal: true }
      this.state = "stopped"
      this.logAudit("recovery.action", "stop", action.reason)
      return this.makeTick("stopped", action, action.reason)
    }

    if (this.budget >= this.config.maxBudget) {
      const action: RecoveryAction = { kind: "stop", reason: "supervisor tool-call budget exceeded", terminal: true }
      this.state = "stopped"
      this.logAudit("recovery.action", "stop", action.reason)
      return this.makeTick("stopped", action, action.reason)
    }

    this.delayMs = Math.min(this.delayMs * this.config.backoffMultiplier, 30_000)
    return this.makeTick("watching", undefined, "watching")
  }

  private tick(): SupervisorTick {
    return this.observe(false)
  }

  private isTerminal(): boolean {
    return this.state === "stopped" || this.state === "budget_exceeded"
  }

  private makeTick(state: SupervisorState, action?: RecoveryAction, reason?: string): SupervisorTick {
    return {
      iteration: this.iteration,
      state,
      budget: this.budget,
      noProgressCount: this.noProgressCount,
      delayMs: this.delayMs,
      action,
      reason,
      terminal: state === "stopped" || state === "budget_exceeded",
    }
  }

  private logAudit(kind: "recovery.action" | "supervisor.decision", decision: string, reason?: string): void {
    appendAuditEvent(this.ctx.directory, {
      kind,
      session_id: this.ctx.sessionID,
      run_id: this.ctx.runID,
      agent: this.ctx.agentName,
      decision,
      reason,
      details: { iteration: this.iteration, budget: this.budget, noProgressCount: this.noProgressCount },
    })
  }
}

export interface BoundedSupervisorTickResult {
  ran: boolean
  state?: SupervisorState
  actionKind?: string
  reason?: string
}

/**
 * Run a single bounded supervisor tick during session-start when there is
 * evidence of prior runs (`.codebase/RUNS.jsonl`) or when explicitly enabled.
 * This wires the supervisor/recovery services into the runtime without
 * continuous polling in hooks.
 */
export function runBoundedSupervisorTick(
  directory: string,
  agentName: string,
  opts?: { force?: boolean; noProgressThreshold?: number },
): BoundedSupervisorTickResult {
  const runsPath = join(codebaseDir(directory), "RUNS.jsonl")
  const enabled = opts?.force || process.env.FLOWDECK_SUPERVISOR_ENABLED === "1" || existsSync(runsPath)
  if (!enabled) return { ran: false }

  const loop = new SupervisorLoop(
    { sessionID: "session-start", agentName, availableAgents: [], directory },
    {
      maxIterations: 1,
      maxBudget: 1,
      baseDelayMs: 1,
      backoffMultiplier: 1,
      noProgressThreshold: opts?.noProgressThreshold ?? 1,
    },
  )
  const tick = loop.observe(false)
  return {
    ran: true,
    state: tick.state,
    actionKind: tick.action?.kind,
    reason: tick.reason,
  }
}
