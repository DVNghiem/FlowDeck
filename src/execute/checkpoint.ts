import {
  saveCheckpoint as saveCheckpointState,
  loadCheckpoint as loadCheckpointState,
  clearCheckpoint as clearCheckpointState,
} from "../state/checkpoint"
import type { TaskState } from "../types"

export interface ExecutionCheckpoint {
  taskState: TaskState
  currentStep: number
  completedSteps: string[]
  savedAt: string
}

/** Save checkpoint after an approved step */
export function saveCheckpoint(
  root: string,
  slug: string,
  taskState: TaskState,
  currentStep: number,
  completedSteps: string[]
): void {
  const checkpoint: ExecutionCheckpoint = {
    taskState,
    currentStep,
    completedSteps,
    savedAt: new Date().toISOString(),
  }
  saveCheckpointState(root, slug, checkpoint)
}

/** Load checkpoint for resuming execution */
export function loadCheckpoint(root: string, slug: string): ExecutionCheckpoint | null {
  const checkpoint = loadCheckpointState(root, slug)
  if (!checkpoint) return null

  return {
    taskState: checkpoint.taskState,
    currentStep: checkpoint.currentStep,
    completedSteps: checkpoint.completedSteps,
    savedAt: checkpoint.savedAt,
  }
}

/** Clear checkpoint after successful execution */
export function clearCheckpoint(root: string, slug: string): void {
  clearCheckpointState(root, slug)
}

/** Check if a step has been completed based on checkpoint */
export function isStepCompleted(completedSteps: string[], stepTitle: string): boolean {
  return completedSteps.includes(stepTitle)
}
