import type { TaskState } from "../types"

export interface OrchestratorContextPacket {
  topic: string
  slug: string
  date: string
  currentStep: number
  totalSteps: number
  stepTitle: string
  researchPath: string
  designPath: string | null
  architectPath: string | null
  keyPatterns: string[]
}

/**
 * Build the orchestrator context packet injected into every step delegation.
 */
export function buildContextPacket(
  taskState: TaskState,
  currentStep: number,
  totalSteps: number,
  stepTitle: string,
  researchPath: string,
  designPath: string | null,
  architectPath: string | null,
  keyPatterns: string[] = []
): OrchestratorContextPacket {
  return {
    topic: taskState.topic,
    slug: taskState.slug,
    date: taskState.date,
    currentStep,
    totalSteps,
    stepTitle,
    researchPath,
    designPath,
    architectPath,
    keyPatterns,
  }
}

/**
 * Format the context packet as a markdown header for the task description.
 */
export function formatContextPacket(packet: OrchestratorContextPacket): string {
  return `## Orchestrator Context
- Task: ${packet.topic}
- Date: ${packet.date}
- Step: ${packet.currentStep} of ${packet.totalSteps}: ${packet.stepTitle}
- Research: ${packet.researchPath}
- Design: ${packet.designPath || "none"}
- Architect: ${packet.architectPath || "none"}
- Key patterns: ${packet.keyPatterns.length > 0 ? packet.keyPatterns.join(", ") : "none"}
`
}
