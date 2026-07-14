import { describe, it, expect } from "vitest"

interface PipelineStage {
  name: string
  agent: string
  conditional?: boolean
  condition?: (state: TaskFlags) => boolean
}

interface TaskFlags {
  hasUI: boolean
  needsArchitect: boolean
}

const PIPELINE: PipelineStage[] = [
  { name: "explore", agent: "explorer" },
  { name: "research", agent: "researcher" },
  { name: "architect", agent: "architect", conditional: true, condition: s => s.needsArchitect },
  { name: "design", agent: "designer", conditional: true, condition: s => s.hasUI },
  { name: "plan", agent: "planner" },
  { name: "execute", agent: "execute" },
  { name: "qa", agent: "qa" },
  { name: "ship", agent: "shipper" },
]

function getActiveStages(flags: TaskFlags): string[] {
  return PIPELINE
    .filter(stage => !stage.conditional || stage.condition?.(flags))
    .map(stage => stage.name)
}

describe("conditional pipeline stages", () => {
  it("skips architect when needsArchitect is false", () => {
    const stages = getActiveStages({ hasUI: false, needsArchitect: false })
    expect(stages).not.toContain("architect")
  })

  it("includes architect when needsArchitect is true", () => {
    const stages = getActiveStages({ hasUI: false, needsArchitect: true })
    expect(stages).toContain("architect")
  })

  it("skips designer when hasUI is false", () => {
    const stages = getActiveStages({ hasUI: false, needsArchitect: false })
    expect(stages).not.toContain("design")
  })

  it("includes designer when hasUI is true", () => {
    const stages = getActiveStages({ hasUI: true, needsArchitect: false })
    expect(stages).toContain("design")
  })

  it("includes both conditional stages when both flags are true", () => {
    const stages = getActiveStages({ hasUI: true, needsArchitect: true })
    expect(stages).toContain("architect")
    expect(stages).toContain("design")
  })
})
