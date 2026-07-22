import { describe, it, expect } from "vitest"
import { formatContextPacket, type ExplorationResult, type DerivedTaskContext } from "../../src/services/preflight-explorer"

const baseResult: ExplorationResult = {
  hasStateMD: true,
  hasProjectMD: true,
  hasAgentsMD: true,
  hasPriorTopics: false,
  hasPriorTasks: false,
  availableCommands: [],
  availableAgents: [],
  availableSkills: [],
  techStack: ["TypeScript", "Bun"],
  implementationPatterns: ["All agent prompts use ## Section headers"],
  configKeys: [],
  governanceEnabled: false,
  relevantFiles: [],
  evidenceItems: [],
  exploredAt: "2026-07-08T09:45:00Z",
}

const baseDerived: DerivedTaskContext = {
  likelyUITask: false,
  likelyBackendTask: true,
  hasCICD: false,
  hasTests: true,
  hasDocs: true,
  hasGovernance: false,
  relevantFiles: ["src/foo.ts", "src/bar.ts"],
  techStack: ["TypeScript", "Bun"],
}

describe("formatContextPacket", () => {
  it("always emits the orchestrator context header", () => {
    const packet = formatContextPacket(baseResult, baseDerived)
    expect(packet.startsWith("## Orchestrator Context (do not re-research — already done)")).toBe(true)
  })

  it("includes target, blast radius, patterns, and tech stack from pre-flight", () => {
    const packet = formatContextPacket(baseResult, baseDerived)
    expect(packet).toContain("**Target:** src/foo.ts, src/bar.ts")
    expect(packet).toContain("**Blast radius:** 2 file(s) estimated by keyword match — run fdx-impact for exact blast radius")
    expect(packet).toContain("**Established patterns:** All agent prompts use ## Section headers")
    expect(packet).toContain("**Key imports:**")
    expect(packet).toContain("TypeScript, Bun")
  })

  it("includes phase metadata when supplied", () => {
    const packet = formatContextPacket(baseResult, baseDerived, {
      phase: 2,
      stage: "execute",
      stepsComplete: ["plan"],
      stepsPending: ["execute", "verify"],
    })
    expect(packet).toContain("**Phase context:** phase 2, stage: execute, done: [plan], pending: [execute, verify]")
  })

  it("omits phase line when phase is not provided", () => {
    const packet = formatContextPacket(baseResult, baseDerived)
    expect(packet).not.toContain("**Phase context:**")
  })

  it("uses caller-supplied targets when provided", () => {
    const packet = formatContextPacket(baseResult, baseDerived, {}, "src/specific.ts:42")
    expect(packet).toContain("**Target:** src/specific.ts:42")
    expect(packet).not.toContain("src/foo.ts, src/bar.ts")
  })

  it("marks governance constraints when governance is active", () => {
    const derivedWithGov: DerivedTaskContext = { ...baseDerived, hasGovernance: true }
    const packet = formatContextPacket(baseResult, derivedWithGov)
    expect(packet).toContain("**Constraints:** Governance rules active — load-rules apply")
  })

  it("omits sections when pre-flight found no signals", () => {
    const emptyResult: ExplorationResult = { ...baseResult, implementationPatterns: [], techStack: [] }
    const emptyDerived: DerivedTaskContext = { ...baseDerived, relevantFiles: [], techStack: [] }
    const packet = formatContextPacket(emptyResult, emptyDerived)
    expect(packet).not.toContain("**Established patterns:**")
    expect(packet).not.toContain("**Key imports:**")
    expect(packet).not.toContain("**Target:**")
    expect(packet).toContain("**Prior lessons:** none")
  })
})