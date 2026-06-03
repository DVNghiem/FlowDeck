import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { spawnSync } from "child_process"
import { codebaseDir } from "./codebase-state"
import { logWrite } from "../lib/logger"

const MERGE_ASSIST_FILE = "MERGE_ASSIST.json"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MergeAssistSession {
  id: string
  targetBranch: string
  sourceBranch: string
  featureDescription: string
  integrationBranch?: string
  status: "clarifying" | "inspecting" | "planning" | "awaiting_confirmation" | "executing" | "conflict" | "completed" | "aborted"
  candidateCommits: CandidateCommit[]
  selectedCommits: string[]
  dependentCommits: string[]
  mergePlan?: MergePlan
  confirmations: ConfirmationRecord[]
  conflicts?: ConflictInfo[]
  createdAt: string
  updatedAt: string
}

export interface CandidateCommit {
  sha: string
  subject: string
  author: string
  date: string
  files: string[]
  isLikelyFeature: boolean
  confidence: "high" | "medium" | "low"
}

export interface MergePlan {
  targetBranch: string
  sourceBranch: string
  integrationBranch: string
  selectedCommits: string[]
  method: "cherry-pick" | "cherry-pick-range" | "manual-port" | "abort"
  risks: string[]
  recommendedCommands: string[]
  dryRun: boolean
}

export interface ConfirmationRecord {
  step: string
  prompt: string
  status: "pending" | "approved" | "rejected"
  requestedAt: string
  resolvedAt?: string
}

export interface ConflictInfo {
  file: string
  commitSha: string
  description: string
}

interface MergeAssistState {
  version: string
  lastUpdated: string
  sessions: Record<string, MergeAssistSession>
}

// ─── State I/O ───────────────────────────────────────────────────────────────

function statePath(directory: string): string {
  return join(codebaseDir(directory), MERGE_ASSIST_FILE)
}

function emptyState(): MergeAssistState {
  return { version: "1.0", lastUpdated: new Date().toISOString(), sessions: {} }
}

function readState(directory: string): MergeAssistState {
  const p = statePath(directory)
  if (!existsSync(p)) return emptyState()
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as MergeAssistState
  } catch {
    return emptyState()
  }
}

function writeState(directory: string, state: MergeAssistState): { success: true } | { error: string } {
  try {
    const base = codebaseDir(directory)
    if (!existsSync(base)) mkdirSync(base, { recursive: true })
    const newState = { ...state, lastUpdated: new Date().toISOString() }
    writeFileSync(statePath(directory), JSON.stringify(newState, null, 2), "utf-8")
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function timestamp(): string {
  return new Date().toISOString()
}

function generateId(): string {
  return `ma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Git Helpers (read-only) ─────────────────────────────────────────────────

function safeGit(cwd: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" })
  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    status: result.status ?? null,
  }
}

function isGitRepo(cwd: string): boolean {
  return existsSync(join(cwd, ".git")) && safeGit(cwd, ["rev-parse", "--git-dir"]).status === 0
}

function branchExists(cwd: string, branch: string): boolean {
  return safeGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0
}

function getMergeBase(cwd: string, target: string, source: string): string | null {
  const result = safeGit(cwd, ["merge-base", target, source])
  if (result.status !== 0) return null
  return result.stdout.trim()
}

function getFeatureCommits(cwd: string, mergeBase: string, source: string): string[] {
  const result = safeGit(cwd, ["log", "--oneline", "--ancestry-path", `${mergeBase}..${source}`])
  if (result.status !== 0) return []
  return result.stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(" ")[0])
    .filter(Boolean)
}

function getCommitMetadata(cwd: string, sha: string): { sha: string; subject: string; author: string; date: string } | null {
  const result = safeGit(cwd, ["log", "-1", "--format=%H%x00%s%x00%an%x00%ad", "--date=iso", sha])
  if (result.status !== 0) return null
  const parts = result.stdout.split("\x00")
  if (parts.length < 4) return null
  return { sha: parts[0], subject: parts[1], author: parts[2], date: parts[3] }
}

function getCommitFiles(cwd: string, sha: string): string[] {
  const result = safeGit(cwd, ["diff", "--name-only", `${sha}^..${sha}`])
  if (result.status !== 0) return []
  return result.stdout.split("\n").map(f => f.trim()).filter(Boolean)
}

// ─── Analysis Helpers ────────────────────────────────────────────────────────

function isLikelyFeatureCommit(subject: string, files: string[]): { isLikelyFeature: boolean; confidence: CandidateCommit["confidence"] } {
  const lower = subject.toLowerCase()
  const featKeywords = ["feat", "feature", "add", "implement", "introduce", "support", "enable"]
  const depKeywords = ["refactor", "prep", "prepare", "fix", "setup", "wip", "draft", "revert"]
  const testOnly = files.length > 0 && files.every(f => f.includes("test") || f.includes("spec"))

  if (featKeywords.some(k => lower.includes(k)) && !testOnly) {
    return { isLikelyFeature: true, confidence: "high" }
  }
  if (depKeywords.some(k => lower.includes(k))) {
    return { isLikelyFeature: false, confidence: "medium" }
  }
  if (testOnly) {
    return { isLikelyFeature: false, confidence: "medium" }
  }
  return { isLikelyFeature: true, confidence: "low" }
}

export function findCandidateCommits(cwd: string, sourceBranch: string, targetBranch: string): CandidateCommit[] {
  const mergeBase = getMergeBase(cwd, targetBranch, sourceBranch)
  if (!mergeBase) return []

  const shas = getFeatureCommits(cwd, mergeBase, sourceBranch)
  const candidates: CandidateCommit[] = []

  for (const sha of shas) {
    const meta = getCommitMetadata(cwd, sha)
    if (!meta) continue
    const files = getCommitFiles(cwd, sha)
    const { isLikelyFeature, confidence } = isLikelyFeatureCommit(meta.subject, files)
    candidates.push({
      sha: meta.sha,
      subject: meta.subject,
      author: meta.author,
      date: meta.date,
      files,
      isLikelyFeature,
      confidence,
    })
  }

  return candidates
}

export function detectDependencies(candidateCommits: CandidateCommit[]): string[] {
  const dependentShas = new Set<string>()
  const fileToCommits: Record<string, string[]> = {}

  for (const commit of candidateCommits) {
    for (const file of commit.files) {
      if (!fileToCommits[file]) fileToCommits[file] = []
      fileToCommits[file].push(commit.sha)
    }
  }

  // Commits touching the same files are potential dependencies
  for (const [, shas] of Object.entries(fileToCommits)) {
    if (shas.length > 1) {
      for (const sha of shas) dependentShas.add(sha)
    }
  }

  // Commits with dependency keywords in messages
  const depKeywords = ["refactor", "prep", "prepare", "fix", "setup", "wip", "depends on", "prerequisite"]
  for (const commit of candidateCommits) {
    const lower = commit.subject.toLowerCase()
    if (depKeywords.some(k => lower.includes(k))) {
      dependentShas.add(commit.sha)
    }
  }

  return Array.from(dependentShas)
}

export function recommendMethod(candidateCommits: CandidateCommit[], selectedCommits: string[]): MergePlan["method"] {
  if (selectedCommits.length === 0) return "abort"

  const ordered = candidateCommits.filter(c => selectedCommits.includes(c.sha))
  if (ordered.length === 0) return "abort"

  // Check if contiguous
  const idxs = ordered.map(c => candidateCommits.findIndex(x => x.sha === c.sha))
  let contiguous = true
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) {
      contiguous = false
      break
    }
  }

  if (selectedCommits.length === 1) return "cherry-pick"
  if (contiguous) return "cherry-pick-range"
  return "manual-port"
}

export function generateRecommendedCommands(plan: MergePlan): string[] {
  const localCmds: string[] = []
  const remoteCmds: string[] = []

  localCmds.push(`git checkout -b ${plan.integrationBranch} ${plan.targetBranch}`)

  if (plan.method === "cherry-pick") {
    for (const sha of plan.selectedCommits) {
      localCmds.push(`git cherry-pick ${sha}`)
    }
  } else if (plan.method === "cherry-pick-range") {
    const first = plan.selectedCommits[0]
    const last = plan.selectedCommits[plan.selectedCommits.length - 1]
    localCmds.push(`git cherry-pick ${first}^..${last}`)
  } else if (plan.method === "manual-port") {
    localCmds.push(`# Manual port required — review each commit and apply changes manually`)
    for (const sha of plan.selectedCommits) {
      localCmds.push(`# Review: git show ${sha}`)
    }
  } else if (plan.method === "abort") {
    localCmds.push(`# No commits selected — aborting merge-assist workflow`)
    return localCmds
  }

  remoteCmds.push(`git push -u origin ${plan.integrationBranch}`)
  remoteCmds.push(`gh pr create --base ${plan.targetBranch} --head ${plan.integrationBranch} --title "Merge-assist: ${plan.sourceBranch} → ${plan.targetBranch}"`)

  return [
    "# --- Local commands (no auth required) ---",
    ...localCmds,
    "",
    "# --- Remote commands (GitHub auth required) ---",
    ...remoteCmds,
    "",
    "# NOTE: The agent will NEVER ask for your GitHub token, password, or SSH key.",
    "# If you need to push or create a PR, run the remote commands manually or defer this step.",
  ]
}

function buildRisks(candidateCommits: CandidateCommit[], selectedCommits: string[], dependentCommits: string[]): string[] {
  const risks: string[] = []
  const selectedSet = new Set(selectedCommits)
  const missingDeps = dependentCommits.filter(d => !selectedSet.has(d))

  if (missingDeps.length > 0) {
    risks.push(`Potentially missing dependent commits: ${missingDeps.join(", ")}`)
  }
  if (selectedCommits.length > 10) {
    risks.push("Large number of commits — high chance of conflicts")
  }
  if (candidateCommits.some(c => selectedSet.has(c.sha) && c.files.some(f => f.includes("package-lock") || f.includes("yarn.lock") || f.includes("bun.lockb")))) {
    risks.push("Lockfile changes detected — verify dependency compatibility")
  }
  if (candidateCommits.some(c => selectedSet.has(c.sha) && c.files.some(f => f.includes("migration") || f.includes("schema") || f.includes(".sql")))) {
    risks.push("Database/schema changes detected — verify migration order")
  }

  return risks
}

// ─── Confirmation Helpers ────────────────────────────────────────────────────

function makeConfirmation(step: string, prompt: string): ConfirmationRecord {
  return { step, prompt, status: "pending", requestedAt: timestamp() }
}

function updateConfirmation(session: MergeAssistSession, step: string, approved: boolean): MergeAssistSession {
  return {
    ...session,
    confirmations: session.confirmations.map(c =>
      c.step === step
        ? { ...c, status: approved ? "approved" : "rejected", resolvedAt: timestamp() }
        : c
    ),
  }
}

function isStepApproved(session: MergeAssistSession, step: string): boolean {
  return session.confirmations.some(c => c.step === step && c.status === "approved")
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export const mergeAssistTool: ToolDefinition = tool({
  description: "Human-in-the-loop selective branch integration. Provides structured analysis and confirmation state management for cherry-pick or manual port workflows. Never executes state-changing git commands.",
  args: {
    action: tool.schema.enum(["start", "inspect", "plan", "confirm", "abort", "status", "list"]),
    targetBranch: tool.schema.string().optional(),
    sourceBranch: tool.schema.string().optional(),
    featureDescription: tool.schema.string().optional(),
    sessionId: tool.schema.string().optional(),
    selectedCommits: tool.schema.array(tool.schema.string()).optional(),
    step: tool.schema.string().optional(),
    approved: tool.schema.boolean().optional(),
    integrationBranch: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const state = readState(dir)

    if (!isGitRepo(dir)) {
      return JSON.stringify({ error: "Not a git repository" })
    }

    const log = (msg: string) => logWrite(dir, "info", "merge-assist", msg)

    switch (args.action) {
      case "start": {
        if (!args.targetBranch || !args.sourceBranch || !args.featureDescription) {
          return JSON.stringify({ error: "targetBranch, sourceBranch, and featureDescription are required for start" })
        }
        if (!branchExists(dir, args.targetBranch)) {
          return JSON.stringify({ error: `Target branch '${args.targetBranch}' does not exist` })
        }
        if (!branchExists(dir, args.sourceBranch)) {
          return JSON.stringify({ error: `Source branch '${args.sourceBranch}' does not exist` })
        }

        const id = generateId()
        const now = timestamp()
        const session: MergeAssistSession = {
          id,
          targetBranch: args.targetBranch,
          sourceBranch: args.sourceBranch,
          featureDescription: args.featureDescription,
          status: "clarifying",
          candidateCommits: [],
          selectedCommits: [],
          dependentCommits: [],
          confirmations: [
            makeConfirmation("branch_selection", `Confirm integrating from '${args.sourceBranch}' into '${args.targetBranch}' for: ${args.featureDescription}`),
          ],
          createdAt: now,
          updatedAt: now,
        }
        const newState = { ...state, sessions: { ...state.sessions, [id]: session } }
        const writeResult = writeState(dir, newState)
        if ("error" in writeResult) return JSON.stringify({ error: writeResult.error })
        log(`Session ${id} started: ${args.sourceBranch} → ${args.targetBranch}`)
        return JSON.stringify({ success: true, session })
      }

      case "inspect": {
        if (!args.sessionId) return JSON.stringify({ error: "sessionId is required for inspect" })
        const session = state.sessions[args.sessionId]
        if (!session) return JSON.stringify({ error: `Session not found: ${args.sessionId}` })

        const candidates = findCandidateCommits(dir, session.sourceBranch, session.targetBranch)
        const hasCommitSelection = session.confirmations.some(c => c.step === "commit_selection")
        const newSession: MergeAssistSession = {
          ...session,
          candidateCommits: candidates,
          dependentCommits: detectDependencies(candidates),
          status: "inspecting",
          confirmations: hasCommitSelection
            ? session.confirmations
            : [...session.confirmations, makeConfirmation("commit_selection", `Select commits that represent the feature '${session.featureDescription}' from ${candidates.length} candidate(s)`)],
          updatedAt: timestamp(),
        }
        const newState = { ...state, sessions: { ...state.sessions, [args.sessionId]: newSession } }
        const writeResult = writeState(dir, newState)
        if ("error" in writeResult) return JSON.stringify({ error: writeResult.error })
        log(`Session ${session.id}: inspected ${candidates.length} candidate commits`)
        return JSON.stringify({ success: true, session: newSession, candidates, dependentCommits: newSession.dependentCommits })
      }

      case "plan": {
        if (!args.sessionId) return JSON.stringify({ error: "sessionId is required for plan" })
        const session = state.sessions[args.sessionId]
        if (!session) return JSON.stringify({ error: `Session not found: ${args.sessionId}` })

        const selected = args.selectedCommits ?? session.selectedCommits
        if (!selected || selected.length === 0) {
          return JSON.stringify({ error: "selectedCommits required for plan" })
        }

        const integrationBranch = args.integrationBranch ?? `merge-assist/${session.sourceBranch}-to-${session.targetBranch}`

        const method = recommendMethod(session.candidateCommits, selected)
        const risks = buildRisks(session.candidateCommits, selected, session.dependentCommits)

        const plan: MergePlan = {
          targetBranch: session.targetBranch,
          sourceBranch: session.sourceBranch,
          integrationBranch,
          selectedCommits: selected,
          method,
          risks,
          recommendedCommands: [],
          dryRun: true,
        }
        const planWithCommands = { ...plan, recommendedCommands: generateRecommendedCommands(plan) }

        let newConfirmations = session.confirmations
        const planSteps = ["integration_branch", "method_selection", "dependency_inclusion"]
        for (const step of planSteps) {
          if (!newConfirmations.find(c => c.step === step)) {
            let prompt = ""
            if (step === "integration_branch") prompt = `Use integration branch '${integrationBranch}'?`
            if (step === "method_selection") prompt = `Use merge method '${method}'?`
            if (step === "dependency_inclusion") prompt = `Include dependent commits ${session.dependentCommits.length > 0 ? `(${session.dependentCommits.join(", ")})` : "(none detected)"}?`
            newConfirmations = [...newConfirmations, makeConfirmation(step, prompt)]
          }
        }

        let newStatus: MergeAssistSession["status"] = "planning"
        if (planSteps.every(s => isStepApproved({ ...session, confirmations: newConfirmations }, s))) {
          newStatus = "awaiting_confirmation"
          if (!newConfirmations.find(c => c.step === "execute_plan")) {
            newConfirmations = [...newConfirmations, makeConfirmation("execute_plan", "Execute the recommended commands?")]
          }
        }

        const newSession: MergeAssistSession = {
          ...session,
          selectedCommits: selected,
          integrationBranch,
          mergePlan: planWithCommands,
          status: newStatus,
          confirmations: newConfirmations,
          updatedAt: timestamp(),
        }
        const newState = { ...state, sessions: { ...state.sessions, [args.sessionId]: newSession } }
        const writeResult = writeState(dir, newState)
        if ("error" in writeResult) return JSON.stringify({ error: writeResult.error })
        log(`Session ${session.id}: plan created with method ${method}, ${selected.length} commit(s)`)
        return JSON.stringify({ success: true, session: newSession, plan: planWithCommands })
      }

      case "confirm": {
        if (!args.sessionId) return JSON.stringify({ error: "sessionId is required for confirm" })
        if (!args.step) return JSON.stringify({ error: "step is required for confirm" })
        if (args.approved === undefined) return JSON.stringify({ error: "approved boolean is required for confirm" })

        let session = state.sessions[args.sessionId]
        if (!session) return JSON.stringify({ error: `Session not found: ${args.sessionId}` })

        session = updateConfirmation(session, args.step, args.approved)
        log(`Session ${session.id}: step '${args.step}' ${args.approved ? "approved" : "rejected"}`)

        let newStatus = session.status
        let newConfirmations = session.confirmations

        if (args.approved) {
          if (args.step === "branch_selection" && session.status === "clarifying") {
            newStatus = "inspecting"
          } else if (args.step === "commit_selection" && session.status === "inspecting") {
            newStatus = "planning"
          } else if (["integration_branch", "method_selection", "dependency_inclusion"].includes(args.step) && session.status === "planning") {
            const planSteps = ["integration_branch", "method_selection", "dependency_inclusion"]
            if (planSteps.every(s => isStepApproved(session, s))) {
              newStatus = "awaiting_confirmation"
              if (!newConfirmations.find(c => c.step === "execute_plan")) {
                newConfirmations = [...newConfirmations, makeConfirmation("execute_plan", "Execute the recommended commands?")]
              }
            }
          } else if (args.step === "execute_plan" && session.status === "awaiting_confirmation") {
            newStatus = "executing"
            if (!newConfirmations.find(c => c.step === "push_pr")) {
              newConfirmations = [...newConfirmations, makeConfirmation("push_pr", "Push the integration branch and open a PR?")]
            }
          } else if (args.step === "push_pr" && session.status === "executing") {
            newStatus = "completed"
          }
        }

        const newSession = { ...session, status: newStatus, confirmations: newConfirmations, updatedAt: timestamp() }
        const newState = { ...state, sessions: { ...state.sessions, [args.sessionId]: newSession } }
        const writeResult = writeState(dir, newState)
        if ("error" in writeResult) return JSON.stringify({ error: writeResult.error })
        return JSON.stringify({ success: true, session: newSession, step: args.step, approved: args.approved })
      }

      case "abort": {
        if (!args.sessionId) return JSON.stringify({ error: "sessionId is required for abort" })
        const session = state.sessions[args.sessionId]
        if (!session) return JSON.stringify({ error: `Session not found: ${args.sessionId}` })
        const newSession: MergeAssistSession = { ...session, status: "aborted", updatedAt: timestamp() }
        const newState = { ...state, sessions: { ...state.sessions, [args.sessionId]: newSession } }
        const writeResult = writeState(dir, newState)
        if ("error" in writeResult) return JSON.stringify({ error: writeResult.error })
        log(`Session ${session.id}: aborted`)
        return JSON.stringify({ success: true, session: newSession, message: "Session aborted" })
      }

      case "status": {
        if (!args.sessionId) return JSON.stringify({ error: "sessionId is required for status" })
        const session = state.sessions[args.sessionId]
        if (!session) return JSON.stringify({ error: `Session not found: ${args.sessionId}` })
        return JSON.stringify({ success: true, session })
      }

      case "list": {
        const sessions = Object.values(state.sessions)
        return JSON.stringify({ success: true, count: sessions.length, sessions })
      }

      default: {
        return JSON.stringify({ error: `Unknown action: ${args.action}` })
      }
    }
  },
})
