/**
 * `/fd-task` command implementation.
 * Runs: explorer → researcher → [architect] → [designer] → planner → PAUSE
 * Phase 1 runtime — real agent delegation via agent-runtime.ts.
 */

import { writeFileSync } from "fs"
import type { TaskState } from "../types.js"
import {
  readTaskState,
  writeTaskState,
  initializeTaskState,
  updateTaskStatus,
  updateTaskStage,
  slugify,
  taskDir,
} from "../lib/task-state.js"
import { buildContextPacket } from "../lib/context-packet.js"
import { delegateToAgent } from "../lib/agent-runtime.js"

// ── Types ────────────────────────────────────────────────────────────────────

export interface FdTaskOptions {
  model?: string
  dryRun?: boolean
}

export interface FdTaskResult {
  taskSlug: string
  finalStatus: TaskState["status"]
  outputs: {
    explorationPath: string
    researchPath: string
    architectPath?: string
    designPath?: string
    planPath: string
  }
  nextAction: "CONFIRM" | "ABORT" | "WAITING_FOR_CONFIRMATION"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function explorationPath(root: string, slug: string): string {
  return `${taskDir(root, slug)}/exploration-summary.md`
}

function researchPath(root: string, slug: string, date: string): string {
  return `${taskDir(root, slug)}/${date}-${slug}-research.md`
}

function architectPath(root: string, slug: string, date: string): string {
  return `${taskDir(root, slug)}/${date}-${slug}-architect-affect.md`
}

function designPath(root: string, slug: string, date: string): string {
  return `${taskDir(root, slug)}/${date}-${slug}-design.md`
}

function planPath(root: string, slug: string, date: string): string {
  return `${taskDir(root, slug)}/${date}-${slug}-plan.md`
}

// ── Parse exploration summary ─────────────────────────────────────────────────

interface ExplorationFlags {
  hasUI: boolean
  needsArchitect: boolean
  topic: string
  description?: string
  constraints?: string[]
}

/**
 * Parse `<!-- exploration-summary -->` block from explorer output.
 * Format:
 * ```
 * <!-- exploration-summary -->
 * has_ui: true
 * needs_architect: false
 * topic: Add user authentication
 * description: JWT-based auth with OAuth2 fallback
 * constraints:
 *   - Must work with existing PostgreSQL schema
 *   - No new external services
 * <!-- /exploration-summary -->
 * ```
 */
function parseExplorationFlags(output: string): ExplorationFlags {
  const marker = "<!-- exploration-summary -->"
  const start = output.indexOf(marker)

  if (start === -1) {
    return {
      hasUI: /has[\s_-]?ui[\s]*[:=]\s*(true|yes|1)/i.test(output),
      needsArchitect: /needs[\s_-]?architect[\s]*[:=]\s*(true|yes|1)/i.test(output),
      topic: "",
    }
  }

  const endMarker = "<!-- /exploration-summary -->"
  const end = output.indexOf(endMarker, start)
  const block = end === -1
    ? output.slice(start + marker.length)
    : output.slice(start + marker.length, end)

  const hasUI = /has[\s_-]?ui[\s]*[:=]\s*(true|yes|1)/i.test(block)
  const needsArchitect = /needs[\s_-]?architect[\s]*[:=]\s*(true|yes|1)/i.test(block)
  const topic = extractField(block, "topic") ?? ""
  const description = extractField(block, "description") ?? undefined
  const constraints = extractConstraints(block)

  return { hasUI, needsArchitect, topic, description, constraints }
}

/** Extract a field value from a block (after colon, up to end of line). */
function extractField(block: string, field: string): string | null {
  const match = block.match(new RegExp(`^${field}[\\s]*[:=][\\s]*(.+)$`, "im"))
  return match ? match[1]!.trim() : null
}

/** Extract constraint list from a block. */
function extractConstraints(block: string): string[] {
  const lines = block.split("\n")
  let inConstraints = false
  const constraints: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^constraints[\s]*[:=]/.test(trimmed)) {
      inConstraints = true
      continue
    }
    if (inConstraints) {
      if (/^[^:\s-]/.test(trimmed) && trimmed !== "") break
      if (/^[-*]\s+/.test(trimmed)) {
        constraints.push(trimmed.replace(/^[-*]\s+/, ""))
      }
    }
  }
  return constraints
}

// ── Parse plan steps ──────────────────────────────────────────────────────────

/** Count `## Step N` headings in plan content. */
function countPlanSteps(planContent: string): number {
  let max = 0
  for (const m of planContent.matchAll(/^##\s+Step\s+(\d+)/gim)) {
    const n = parseInt(m[1]!, 10)
    if (n > max) max = n
  }
  return max
}

// ── Approval gate ─────────────────────────────────────────────────────────────

function printApprovalGate(topic: string, planFile: string): void {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plan ready for: ${topic}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Review: ${planFile}

Type CONFIRM to proceed to /fd-execute.
Or describe changes needed and the planner will revise.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

// ── Main command ──────────────────────────────────────────────────────────────

/**
 * Run `/fd-task <topic>` with real agent delegation.
 *
 * Pipeline:
 * 1. explore (@explorer) → get hasUI, needsArchitect
 * 2. research (@researcher) → get research.md
 * 3. architect? (@architect if needsArchitect) → check for "requires redesign"
 * 4. design? (@designer if hasUI) → get design.md
 * 5. plan (@planner) → get plan.md with step count
 * 6. PAUSE at approval gate
 */
export async function runFdTask(
  userInput: string,
  rootDir: string,
  options: FdTaskOptions = {}
): Promise<FdTaskResult> {
  const topic = userInput.trim()
  const slug = slugify(topic)
  const date = today()

  // Check for existing pending task
  const existing = await readTaskState(rootDir, slug)
  if (existing && existing.status !== "done") {
    throw new Error(
      `Pending task found for "${topic}" (status: ${existing.status}). ` +
        `Use /fd-resume or /fd-execute to continue.`
    )
  }

  // Initialize task state (hasUI/needsArchitect updated after exploration)
  let state = await initializeTaskState(rootDir, slug, topic, false, false)
  console.log(`[fd-task] Starting task: ${slug}`)

  // ── Stage 1: Explore ────────────────────────────────────────────────────
  console.log("[fd-task] Stage 1: Explore → @explorer")
  await updateTaskStatus(rootDir, slug, "exploring")
  await updateTaskStage(rootDir, slug, "explore")

  const expResult = await delegateToAgent("explorer", `Explore and break down: ${topic}`)

  if (expResult.error) {
    throw new Error(`Explorer delegation failed: ${expResult.error}`)
  }

  const expFile = explorationPath(rootDir, slug)
  writeFileSync(expFile, expResult.output, "utf-8")

  const flags = parseExplorationFlags(expResult.output)
  state.hasUI = flags.hasUI
  state.needsArchitect = flags.needsArchitect
  if (flags.topic) {
    state.topic = flags.topic
  }
  await writeTaskState(rootDir, state)

  // ── Stage 2: Research ────────────────────────────────────────────────────
  console.log("[fd-task] Stage 2: Research → @researcher")
  await updateTaskStatus(rootDir, slug, "researching")
  await updateTaskStage(rootDir, slug, "research")

  const ctxPacket = await buildContextPacket(rootDir, state)
  const researchMessage = `Research for: ${topic}\n\nExploration summary:\n${expResult.output}`
  const resResult = await delegateToAgent("researcher", researchMessage, {
    contextPacket: ctxPacket,
  })

  if (resResult.error) {
    throw new Error(`Researcher delegation failed: ${resResult.error}`)
  }

  const resFile = researchPath(rootDir, slug, date)
  writeFileSync(resFile, resResult.output, "utf-8")

  await updateTaskStatus(rootDir, slug, "planning")
  await updateTaskStage(rootDir, slug, "plan")

  // ── Stage 3: Architect (conditional) ────────────────────────────────────
  let finalArchitectPath: string | undefined
  if (state.needsArchitect) {
    console.log("[fd-task] Stage 3: Architect → @architect")

    const archMessage = `Evaluate architecture impact for: ${topic}\n\nResearch:\n${resResult.output}`
    const archResult = await delegateToAgent("architect", archMessage, {
      contextPacket: ctxPacket,
    })

    if (archResult.error) {
      throw new Error(`Architect delegation failed: ${archResult.error}`)
    }

    const archFile = architectPath(rootDir, slug, date)
    writeFileSync(archFile, archResult.output, "utf-8")
    finalArchitectPath = archFile

    // Check for redesign recommendation
    if (archResult.output.toLowerCase().includes("requires redesign")) {
      console.log("[fd-task] ⚠️  Architect recommends redesign. Aborting pipeline.")
      state.status = "exploring"
      state.stage = "explore"
      state.aborted = true
      await writeTaskState(rootDir, state)
      return {
        taskSlug: slug,
        finalStatus: state.status,
        outputs: {
          explorationPath: expFile,
          researchPath: resFile,
          architectPath: finalArchitectPath,
          planPath: "",
        },
        nextAction: "ABORT",
      }
    }
  }

  // ── Stage 4: Design (conditional) ───────────────────────────────────────
  let finalDesignPath: string | undefined
  if (state.hasUI) {
    console.log("[fd-task] Stage 4: Design → @designer")

    const designMessage = `Design UI for: ${topic}\n\nExploration:\n${expResult.output}`
    const designResult = await delegateToAgent("designer", designMessage, {
      contextPacket: ctxPacket,
    })

    if (designResult.error) {
      throw new Error(`Designer delegation failed: ${designResult.error}`)
    }

    const desFile = designPath(rootDir, slug, date)
    writeFileSync(desFile, designResult.output, "utf-8")
    finalDesignPath = desFile
  }

  // ── Stage 5: Plan ────────────────────────────────────────────────────────
  console.log("[fd-task] Stage 5: Plan → @planner")

  const planMessage = `Create step-by-step TDD plan for: ${topic}\n\nResearch:\n${resResult.output}${state.hasUI && finalDesignPath ? `\n\nDesign:\n${finalDesignPath}` : ""}`
  const planResult = await delegateToAgent("planner", planMessage, {
    contextPacket: ctxPacket,
  })

  if (planResult.error) {
    throw new Error(`Planner delegation failed: ${planResult.error}`)
  }

  const planFile = planPath(rootDir, slug, date)
  writeFileSync(planFile, planResult.output, "utf-8")

  // Parse step count and update state
  const stepCount = countPlanSteps(planResult.output)
  state.stepsTotal = stepCount
  state.status = "awaiting_confirm"
  await writeTaskState(rootDir, state)

  // ── Approval gate ────────────────────────────────────────────────────────
  printApprovalGate(topic, planFile)

  return {
    taskSlug: slug,
    finalStatus: "awaiting_confirm",
    outputs: {
      explorationPath: expFile,
      researchPath: resFile,
      architectPath: finalArchitectPath,
      designPath: finalDesignPath,
      planPath: planFile,
    },
    nextAction: "WAITING_FOR_CONFIRMATION",
  }
}
