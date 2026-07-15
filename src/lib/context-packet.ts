/**
 * Context packet builder for orchestrator injection.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { TaskState } from "../types.js"
import { taskDir } from "./task-state.js"

export interface ContextPacket {
  slug: string
  topic: string
  currentStep: number
  totalSteps: number
  stage: string
  researchFiles: string[]
  architectPatterns: string[]
  designNotes: string[]
  constraints: string[]
}

// ── File extraction ───────────────────────────────────────────────────────────

const MAX_LINES = 50

/** Extract first N lines from a file, or null if not found. */
function extractLines(filePath: string, maxLines = MAX_LINES): string | null {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n").slice(0, maxLines)
    return lines.join("\n")
  } catch {
    return null
  }
}

/** Extract constraints from exploration-summary block. */
const H3 = "###"
function extractConstraints(explorationContent: string | null): string[] {
  if (!explorationContent) return []
  const constraints: string[] = []
  const lines = explorationContent.split("\n")
  let inBlock = false
  for (const line of lines) {
    if (line.includes("Constraints")) {
      inBlock = true
      continue
    }
    if (inBlock && line.length >= 2 && line[0] === "#" && line[1] === "#") break
    if (inBlock && /^[-*]\s+/.test(line)) {
      constraints.push(line.replace(/^[-*]\s+/, "").trim())
    }
  }
  return constraints
}

// ── Context build ─────────────────────────────────────────────────────────────

/**
 * Build context packet from task state and plan artifacts.
 * Reads research.md, architect-affect.md, design.md from .fd-plan/<slug>/.
 */
export async function buildContextPacket(
  root: string,
  state: TaskState
): Promise<ContextPacket> {
  const dir = taskDir(root, state.slug)

  const researchPath = join(dir, `research.md`)
  const architectPath = join(dir, `architect-affect.md`)
  const designPath = join(dir, `design.md`)
  const explorationPath = join(dir, `exploration-summary.md`)

  const research = extractLines(researchPath)
  const architect = extractLines(architectPath)
  const design = extractLines(designPath)
  const exploration = extractLines(explorationPath)

  const researchFiles: string[] = []
  const architectPatterns: string[] = []
  const designNotes: string[] = []

  if (research) researchFiles.push(researchPath)
  if (architect) architectPatterns.push(architectPath)
  if (design) designNotes.push(designPath)

  return {
    slug: state.slug,
    topic: state.topic,
    currentStep: state.stepsComplete,
    totalSteps: state.stepsTotal,
    stage: state.stage,
    researchFiles,
    architectPatterns,
    designNotes,
    constraints: extractConstraints(exploration),
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format context packet as markdown block.
 * Kept under ~400 tokens by limiting file content lines.
 */
export function formatContextPacket(packet: ContextPacket): string {
  const lines: string[] = [
    "## Orchestrator Context",
    "",
    `**Task**: ${packet.topic}`,
    `**Stage**: ${packet.stage}`,
    `**Progress**: ${packet.currentStep}/${packet.totalSteps} steps`,
    "",
  ]

  if (packet.constraints.length > 0) {
    lines.push("**Constraints**:")
    for (const c of packet.constraints.slice(0, 5)) {
      lines.push(`- ${c}`)
    }
    lines.push("")
  }

  if (packet.researchFiles.length > 0) {
    lines.push("**Research**:")
    for (const f of packet.researchFiles) {
      lines.push(`- ${f}`)
    }
    lines.push("")
  }

  if (packet.architectPatterns.length > 0) {
    lines.push("**Architecture**:")
    for (const f of packet.architectPatterns) {
      lines.push(`- ${f}`)
    }
    lines.push("")
  }

  if (packet.designNotes.length > 0) {
    lines.push("**Design**:")
    for (const f of packet.designNotes) {
      lines.push(`- ${f}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

// ── Injection ─────────────────────────────────────────────────────────────────

/**
 * Prepend formatted context packet to a user message.
 * Used by orchestrator before delegating to agents.
 */
export async function injectContextIntoMessage(
  message: string,
  packet: ContextPacket
): Promise<string> {
  const ctx = formatContextPacket(packet)
  return `${ctx}\n\n---\n\n${message}`
}
