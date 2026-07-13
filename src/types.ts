export type WorkflowStage =
  | "explore"
  | "research"
  | "architect"
  | "design"
  | "plan"
  | "execute"
  | "qa"
  | "ship"
  | "done"

export type TaskStatus =
  | "exploring"
  | "researching"
  | "planning"
  | "awaiting_confirm"
  | "executing"
  | "qa"
  | "awaiting_ship"
  | "done"

export interface TaskState {
  topic: string
  slug: string                   // kebab-case topic
  date: string                   // YYYY-MM-DD
  status: TaskStatus
  stage: WorkflowStage
  hasUI: boolean                 // triggers designer
  needsArchitect: boolean        // set by planner
  planConfirmed: boolean
  stepsTotal: number
  stepsComplete: number
  lastUpdatedAt: string
  qaSkipped?: boolean
  aborted?: boolean
}

export interface CheckpointState {
  taskState: TaskState
  currentStep: number
  completedSteps: string[]
  savedAt: string
}
