/**
 * `/fd-task` command implementation.
 * Runs: explorer → researcher → [architect] → [designer] → planner → PAUSE
 * Phase 1 runtime.
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
}

/** Parse `<!-- exploration-summary -->` block from explorer output. */
function parseExplorationFlags(output: string): ExplorationFlags {
  const marker = "<!-- exploration-summary -->"
  const start = output.indexOf(marker)
  if (start === -1) {
    return {
      hasUI: /has[\s_-]?ui[\s]*[:=]\s*(true|yes|1)/i.test(output),
      needsArchitect: /needs?_?architect[\s]*[:=]\s*(true|yes|1)/i.test(output),
    }
  }
  const endBlock = output.indexOf("<!-- /exploration-summary -->", start)
  const block = endBlock === -1
    ? output.slice(start + marker.length)
    : output.slice(start + marker.length, endBlock)

  return {
    hasUI: /has[\s_-]?ui[\s]*[:=]\s*(true|yes|1)/i.test(block),
    needsArchitect: /needs?_?architect[\s]*[:=]\s*(true|yes|1)/i.test(block),
  }
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
 * Run `/fd-task <topic>`.
 *
 * Pipeline: explore → research → [architect] → [designer] → plan → PAUSE
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

  // Initialize task state (hasUI/needsArchitect set after exploration)
  const state = await initializeTaskState(rootDir, slug, topic, false, false)
  console.log(`[fd-task] Starting task: ${slug}`)

  // ── Stage 1: Explore ───────────────────────────────────────────────────
  console.log("[fd-task] Stage 1: Explore — @explorer delegate stub (Phase 2)")
  await updateTaskStatus(rootDir, slug, "exploring")
  await updateTaskStage(rootDir, slug, "explore")

  // Placeholder: real delegation via Agent tool in Phase 2
  const expFile = explorationPath(rootDir, slug)
  const expContent = `<!-- exploration-summary -->
has_ui: false
needs_architect: false

# Exploration Summary

Topic: ${topic}
Explored at: ${new Date().toISOString()}

Placeholder — real exploration via @explorer agent in Phase 2.
<!-- /exploration-summary -->
`
  writeFileSync(expFile, expContent, "utf-8")

  const { hasUI, needsArchitect } = parseExplorationFlags(expContent)
  state.hasUI = hasUI
  state.needsArchitect = needsArchitect
  await writeTaskState(rootDir, state)

  // ── Stage 2: Research ─────────────────────────────────────────────────
  console.log("[fd-task] Stage 2: Research — @researcher delegate stub (Phase 2)")
  await updateTaskStatus(rootDir, slug, "researching")
  await updateTaskStage(rootDir, slug, "research")

  const resFile = researchPath(rootDir, slug, date)
    const resContent = `# Research: ${topic}

Research placeholder — via @researcher agent in Phase 2.
`
  writeFileSync(resFile, resContent, "utf-8")

  await updateTaskStatus(rootDir, slug, "planning")
  await updateTaskStage(rootDir, slug, "plan")

  // ── Stage 3: Architect (conditional) ─────────────────────────────────
  let finalArchitectPath: string | undefined
  if (state.needsArchitect) {
    console.log("[fd-task] Stage 3: Architect — @architect delegate stub (Phase 2)")

    const archFile = architectPath(rootDir, slug, date)
    const archContent = `# Architecture Impact: ${topic}

Architecture placeholder — via @architect agent in Phase 2.
`
    writeFileSync(archFile, archContent, "utf-8")
    finalArchitectPath = archFile

    // Real check in Phase 2: parse architect output for "requires redesign"
    if (archContent.toLowerCase().includes("requires redesign")) {
      state.status = "exploring"
      state.stage = "explore"
      await writeTaskState(rootDir, state)
      return {
        taskSlug: slug,
        finalStatus: state.status,
        outputs: { explorationPath: expFile, researchPath: resFile, architectPath: finalArchitectPath, planPath: "" },
        nextAction: "ABORT",
      }
    }
  }

  // ── Stage 4: Design (conditional) ────────────────────────────────────
  let finalDesignPath: string | undefined
  if (state.hasUI) {
    console.log("[fd-task] Stage 4: Design — @designer delegate stub (Phase 2)")

    const desFile = designPath(rootDir, slug, date)
    const desContent = `# Design: ${topic}

Design placeholder — via @designer agent in Phase 2.
`
    writeFileSync(desFile, desContent, "utf-8")
    finalDesignPath = desFile
  }

  // ── Stage 5: Plan ─────────────────────────────────────────────────────
  console.log("[fd-task] Stage 5: Plan — @planner delegate stub (Phase 2)")

  const planFile = planPath(rootDir, slug, date)
    const planContent = `# Plan: ${topic}

## Step 1
Placeholder step — via @planner agent in Phase 2.

## Step 2
Placeholder step 2.
`
  writeFileSync(planFile, planContent, "utf-8")

  // Parse step count
  const stepCount = countPlanSteps(planContent)
  state.stepsTotal = stepCount
  state.status = "awaiting_confirm"
  await writeTaskState(rootDir, state)

  // ── Approval gate ─────────────────────────────────────────────────────
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
