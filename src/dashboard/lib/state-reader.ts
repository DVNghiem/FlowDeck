import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { planningDir, readPlanningState } from "../../tools/planning-state-lib"
import { listTraces } from "../../services/run-trace"
import { getPendingApprovals } from "../../services/approval-manager"
import { getStats } from "../../services/agent-performance"
import type { Phase, DashboardData, RecentRun, PendingApproval, AgentPerfSummary, TDDDashboardState } from "../types"

function parsePhaseLine(line: string): Phase | null {
  const completeMatch = line.match(/\- \[x\] Phase (\d+): (.+)/)
  if (completeMatch) {
    return {
      number: parseInt(completeMatch[1], 10),
      name: completeMatch[2].trim(),
      status: "complete",
      stepsComplete: 1,
      stepsPending: 0,
    }
  }
  const pendingMatch = line.match(/\- \[ \] Phase (\d+): (.+)/)
  if (pendingMatch) {
    return {
      number: parseInt(pendingMatch[1], 10),
      name: pendingMatch[2].trim(),
      status: "pending",
      stepsComplete: 0,
      stepsPending: 1,
    }
  }
  // Also match bold markdown syntax: **Phase N:** or - **Phase N:**
  const boldCompleteMatch = line.match(/\- \[x\]\s+\*\*Phase (\d+): (.+?)\*\*/)
  if (boldCompleteMatch) {
    return {
      number: parseInt(boldCompleteMatch[1], 10),
      name: boldCompleteMatch[2].trim(),
      status: "complete",
      stepsComplete: 1,
      stepsPending: 0,
    }
  }
  const boldPendingMatch = line.match(/\- \[ \]\s+\*\*Phase (\d+): (.+?)\*\*/)
  if (boldPendingMatch) {
    return {
      number: parseInt(boldPendingMatch[1], 10),
      name: boldPendingMatch[2].trim(),
      status: "pending",
      stepsComplete: 0,
      stepsPending: 1,
    }
  }
  return null
}

function findCurrentPhase(phases: Phase[]): number {
  // Current phase is the first incomplete (pending) phase
  const first = phases.find(p => p.status === "pending")
  if (first) return first.number
  // If all complete, current is the last one
  if (phases.length > 0) return phases[phases.length - 1].number
  return 0
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (!content.startsWith("---")) return result
  const end = content.indexOf("---", 3)
  if (end === -1) return result
  const fm = content.slice(3, end)
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/)
    if (m) {
      const key = m[1].trim()
      const val = m[2].trim()
      if (val === "true") result[key] = true
      else if (val === "false") result[key] = false
      else if (!isNaN(Number(val))) result[key] = Number(val)
      else result[key] = val
    }
  }
  return result
}

export function readDashboardData(dir: string): DashboardData {
  const pd = planningDir(dir)
  const state = readPlanningState(dir)

  let project = "@dv.nghiem/flowdeck"
  const phases: Phase[] = []

  const roadmapPath = join(pd, "ROADMAP.md")
  if (existsSync(roadmapPath)) {
    const content = readFileSync(roadmapPath, "utf-8")
    const lines = content.split("\n")

    for (const line of lines) {
      const phase = parsePhaseLine(line)
      if (phase) phases.push(phase)
    }
  }

  const total = phases.length
  const completed = phases.filter(p => p.status === "complete").length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  // Determine in_progress: first pending phase, or last complete if all done
  let currentPhase = findCurrentPhase(phases)

  // Mark the current phase as in_progress
  for (const phase of phases) {
    if (phase.status === "pending" && phase.number === currentPhase) {
      phase.status = "in_progress"
      break
    }
  }

  return {
    project,
    phases,
    blockers: state.blockers || [],
    progress: { total, completed, percent },
    currentPhase,
    telemetrySummary: [],
    recentRuns: listTraces(dir, 10).map(t => ({
      run_id: t.run_id,
      command: t.command,
      started_at: t.started_at,
      ended_at: t.ended_at,
      status: t.status,
      risk_score: t.risk_score,
      files_touched: t.files_touched.length,
      outcome: t.outcome,
    })) as RecentRun[],
    pendingApprovals: getPendingApprovals(dir).map(a => ({
      id: a.id,
      trigger: a.trigger,
      reason: a.reason,
      risk_score: a.risk_score,
      file_path: a.file_path,
      requested_at: a.requested_at,
    })) as PendingApproval[],
    agentPerf: getStats(dir)
      .filter(e => e.runs >= 2)
      .map(e => ({
        agent: e.agent,
        model: e.model,
        task_type: e.task_type,
        success_rate: Math.round((e.successes / e.runs) * 100),
        runs: e.runs,
        avg_duration_ms: Math.round(e.total_duration_ms / e.runs),
      })) as AgentPerfSummary[],
    toolFailureCount: 0,
    tdd: buildTDDDashboardState(state as ReturnType<typeof readPlanningState> & { tdd?: { stage: string; cycle: number; behaviors: { status: string }[]; failing_tests: number; passing_tests: number; override_log: unknown[] } }),
  }
}

/**
 * Build TDD dashboard state from planning state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTDDDashboardState(state: any): TDDDashboardState | undefined {
  if (!state.ttd) return undefined

  const completedBehaviors = state.ttd.behaviors.filter((b: { status: string }) => b.status === "complete").length
  const pendingBehaviors = state.ttd.behaviors.filter((b: { status: string }) => b.status !== "complete").length

  return {
    stage: state.ttd.stage,
    cycle: state.ttd.cycle,
    failing_tests: state.ttd.failing_tests,
    passing_tests: state.ttd.passing_tests,
    behaviors_completed: completedBehaviors,
    behaviors_pending: pendingBehaviors,
    bugs_missing_regression: 0, // TODO: compute from FAILURES.json
    overrides_used: state.ttd.override_log.length,
  }
}
