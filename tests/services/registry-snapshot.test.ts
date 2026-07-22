import { describe, it, expect } from "vitest"
import {
  buildRegistrySnapshot,
  detectRegistryDrift,
  formatDriftReport,
} from "@/services/registry-snapshot"
import { REGISTERED_COMMANDS } from "@/services/supervisor-binding"
import { AGENT_NAMES } from "@/agents/index"

describe("buildRegistrySnapshot", () => {
  it("derives every pipeline command from src/commands/*.md", async () => {
    const snapshot = await buildRegistrySnapshot(process.cwd())
    for (const cmd of ["fd-task", "fd-review", "fd-execute", "fd-verify", "fd-done"]) {
      expect(snapshot.commands).toContain(cmd)
    }
  })

  it("derives the support commands from src/commands/*.md", async () => {
    const snapshot = await buildRegistrySnapshot(process.cwd())
    for (const cmd of ["fd-checkpoint", "fd-resume", "fd-status"]) {
      expect(snapshot.commands).toContain(cmd)
    }
  })

  it("no longer derives commands removed by the pipeline refactor", async () => {
    const snapshot = await buildRegistrySnapshot(process.cwd())
    for (const cmd of ["fd-plan", "fd-discuss", "fd-ultrawork", "fd-merge-assist", "fd-init-deep"]) {
      expect(snapshot.commands).not.toContain(cmd)
    }
  })

  it("includes every registered agent except orchestrator", async () => {
    const snapshot = await buildRegistrySnapshot(process.cwd())
    const routeNames = new Set(snapshot.agents.map((a) => a.name))
    for (const name of AGENT_NAMES) {
      if (name === "orchestrator") continue
      expect(routeNames.has(name)).toBe(true)
    }
  })

  it("includes agent descriptions", async () => {
    const snapshot = await buildRegistrySnapshot(process.cwd())
    const backend = snapshot.agents.find((a) => a.name === "backend-coder")
    expect(backend).toBeDefined()
    expect(backend!.description.length).toBeGreaterThan(0)
  })

  it("includes skills with names and descriptions", async () => {
    const snapshot = await buildRegistrySnapshot(process.cwd())
    expect(snapshot.skills.length).toBeGreaterThan(0)
    const skill = snapshot.skills[0]
    expect(skill.name).toBeDefined()
    expect(skill.description).toBeDefined()
  })
})

describe("detectRegistryDrift", () => {
  it("reports no drift against the live static registries", async () => {
    const drift = await detectRegistryDrift(
      process.cwd(),
      REGISTERED_COMMANDS,
      AGENT_NAMES,
    )
    expect(drift.missingCommands).toEqual([])
    expect(drift.staleCommands).toEqual([])
    expect(drift.missingAgents).toEqual([])
    expect(drift.staleAgents).toEqual([])
  })

  it("flags a stale command missing from source", async () => {
    const drift = await detectRegistryDrift(
      process.cwd(),
      ["fd-ghost-command"],
      AGENT_NAMES,
    )
    expect(drift.staleCommands).toContain("fd-ghost-command")
  })

  it("flags a missing command not in static list", async () => {
    const drift = await detectRegistryDrift(
      process.cwd(),
      [],
      AGENT_NAMES,
    )
    expect(drift.missingCommands.length).toBeGreaterThan(0)
    expect(drift.missingCommands).toContain("fd-task")
  })

  it("flags a stale agent missing from source", async () => {
    const drift = await detectRegistryDrift(
      process.cwd(),
      REGISTERED_COMMANDS,
      ["ghost-agent"],
    )
    expect(drift.staleAgents).toContain("ghost-agent")
  })
})

describe("formatDriftReport", () => {
  it("reports clean state when no drift", () => {
    const report = formatDriftReport({
      missingCommands: [],
      staleCommands: [],
      missingAgents: [],
      staleAgents: [],
      orphanSkills: [],
    })
    expect(report).toContain("no drift detected")
  })

  it("lists stale commands", () => {
    const report = formatDriftReport({
      missingCommands: [],
      staleCommands: ["fd-ghost-command"],
      missingAgents: [],
      staleAgents: [],
      orphanSkills: [],
    })
    expect(report).toContain("stale commands: fd-ghost-command")
  })
})
