import { describe, it, expect } from "vitest"

interface TaskFlags {
  hasUI: boolean
  needsArchitect: boolean
}

interface PipelineResult {
  stagesRun: string[]
  skipped: string[]
}

function runPipeline(flags: TaskFlags, onStage: (name: string) => void): PipelineResult {
  const stagesRun: string[] = []
  const skipped: string[] = []

  const stages = [
    { name: "explore", skip: false },
    { name: "research", skip: false },
    { name: "architect", skip: !flags.needsArchitect },
    { name: "design", skip: !flags.hasUI },
    { name: "plan", skip: false },
  ]

  for (const stage of stages) {
    if (stage.skip) {
      skipped.push(stage.name)
    } else {
      onStage(stage.name)
      stagesRun.push(stage.name)
    }
  }

  return { stagesRun, skipped }
}

describe("pipeline stage sequencing", () => {
  it("runs explore, research, plan in order for simple task", () => {
    const result = runPipeline({ hasUI: false, needsArchitect: false }, () => {})
    expect(result.stagesRun).toEqual(["explore", "research", "plan"])
    expect(result.skipped).toEqual(["architect", "design"])
  })

  it("includes architect and design when flags are true", () => {
    const result = runPipeline({ hasUI: true, needsArchitect: true }, () => {})
    expect(result.stagesRun).toEqual(["explore", "research", "architect", "design", "plan"])
    expect(result.skipped).toEqual([])
  })

  it("invokes each stage callback in order", () => {
    const calls: string[] = []
    runPipeline({ hasUI: false, needsArchitect: true }, name => calls.push(name))
    expect(calls).toEqual(["explore", "research", "architect", "plan"])
  })
})
