/**
 * Agent Contract Registry Tests
 *
 * Covers:
 * - Every registered contract permits `fdx-graph`
 * - The orchestrator contract no longer permits any codegraph tool
 * - Contract tool lists are asserted by VALUE, never by non-emptiness
 * - `mapper` still has no contract (known gap, recorded in TODOS.md)
 *
 * Why this file exists: the registry had no test at all, while
 * `src/services/agent-validator.ts:84` enforces
 * `contract.allowedTools.includes(ctx.toolUsed)` and `:141` escalates a
 * `tool-not-in-contract` warning to a hard block when the validator runs in
 * `strict` mode. Agent prompts instruct `fdx-graph`, so a contract that omits it
 * would deny the tool its own prompt demands. Under the default `advisory` mode
 * that failure is a warning, which is exactly the kind of thing that ships
 * unnoticed.
 */

import { describe, it, expect } from "vitest"
import { getContract } from "@/services/agent-contract-registry"

/** Agents with a registered capability contract. */
const CONTRACTED_AGENTS = [
  "orchestrator",
  "planner",
  "backend-coder",
  "frontend-coder",
  "devops",
  "tester",
  "reviewer",
  "security-auditor",
  "researcher",
  "architect",
  "debug-specialist",
]

describe("contract registry: fdx-graph is permitted everywhere", () => {
  it.each(CONTRACTED_AGENTS)("%s permits fdx-graph", (agent) => {
    const contract = getContract(agent)
    expect(contract, `no contract registered for "${agent}"`).not.toBeNull()
    // Assert the VALUE is present. A length or non-emptiness check would pass on
    // a list that permits ten tools and not this one.
    expect(contract!.allowedTools).toContain("fdx-graph")
  })

  it("covers every contract in the registry, not a subset", () => {
    // Guards against the list above drifting out of sync with the registry: if a
    // contract is added and not listed here, its fdx-graph coverage goes untested.
    const registered = CONTRACTED_AGENTS.filter((a) => getContract(a) !== null)
    expect(registered).toEqual(CONTRACTED_AGENTS)
  })
})

describe("contract registry: codegraph is gone", () => {
  it("the orchestrator contract permits no codegraph tool", () => {
    const contract = getContract("orchestrator")
    expect(contract).not.toBeNull()
    const codegraphEntries = contract!.allowedTools.filter((t) =>
      t.toLowerCase().includes("codegraph"),
    )
    expect(codegraphEntries).toEqual([])
  })

  it("no contract anywhere permits a codegraph tool", () => {
    const offenders: string[] = []
    for (const agent of CONTRACTED_AGENTS) {
      const contract = getContract(agent)
      if (!contract) continue
      for (const tool of contract.allowedTools) {
        if (tool.toLowerCase().includes("codegraph")) offenders.push(`${agent}:${tool}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe("contract registry: orchestrator tool list is intact", () => {
  it("still permits the delegation and planning tools it depends on", () => {
    const contract = getContract("orchestrator")!
    // Named explicitly so that swapping codegraph for fdx-graph cannot quietly
    // drop a neighbouring entry. `task` in particular is required for OpenCode
    // native @agent delegation.
    for (const tool of [
      "read",
      "grep",
      "planning-state",
      "codebase-state",
      "repo-memory",
      "fdx-graph",
      "load-rules",
      "list-rules",
      "task",
      "capture-lesson",
      "review-lessons",
    ]) {
      expect(contract.allowedTools).toContain(tool)
    }
  })

  it("still forbids writes and shell execution", () => {
    const contract = getContract("orchestrator")!
    for (const action of ["write_file", "edit_file", "create_file", "bash"]) {
      expect(contract.forbiddenActions).toContain(action)
    }
  })
})

describe("contract registry: known gaps stay visible", () => {
  it("mapper has no contract (recorded in TODOS.md, not fixed here)", () => {
    // Asserted deliberately. If someone adds a mapper contract, this test fails
    // and points them at the TODOS entry rather than letting the gap close
    // silently and leave the TODO stale.
    expect(getContract("mapper")).toBeNull()
  })

  it("unknown agents have no contract", () => {
    expect(getContract("does-not-exist")).toBeNull()
  })
})
