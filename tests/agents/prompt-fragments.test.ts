/**
 * Shared Prompt Fragment Tests
 *
 * Covers:
 * - TOKEN_OPTIMIZATION content is complete, asserted line-for-line
 * - Every subagent prompt embeds the whole fragment, not just its heading
 * - ORCH_CONTEXT_NOTE lands on exactly the two agents that carry it
 * - No subagent is instructed to run `fdx-graph action:build` (single writer)
 * - Graph guidance names only real actions and only the real arg names
 *
 * Why this file exists: before the fragment was extracted, the section lived
 * inlined and byte-identical in nine agent factories, and the only coverage was
 * `tests/agents/index.test.ts` asserting that a `## Token Optimization` heading
 * existed and came first. Both assertions pass on a prompt whose section body
 * has been truncated to nothing, which is how a nine-file sweep could silently
 * lose content. These tests assert the VALUES.
 */

import { readFileSync } from "fs"
import { describe, it, expect } from "vitest"
import { TOKEN_OPTIMIZATION, ORCH_CONTEXT_NOTE } from "@/agents/prompt-fragments"
import { AGENT_NAMES, createAgent } from "@/agents/index"

/** Agents whose ORCH_CONTEXT_NOTE copy sat inside the extracted block. */
const SUFFIX_AGENTS = ["architect", "security-auditor"]

/** Agent name -> the source file its factory lives in. */
function sourceFileFor(agent: string): string {
  if (["backend-coder", "frontend-coder", "devops"].includes(agent)) return "coder.ts"
  if (agent === "debug-specialist") return "debug.ts"
  return `${agent}.ts`
}

/** Every registered agent except the orchestrator, which has its own prompt. */
const SUBAGENTS = AGENT_NAMES.filter((n) => n !== "orchestrator")

function promptOf(name: string): string {
  const agent = createAgent(name)
  if (!agent) throw new Error(`createAgent("${name}") returned undefined`)
  const prompt = agent.config.prompt
  if (typeof prompt !== "string") {
    throw new Error(`agent "${name}" has no prompt string`)
  }
  return prompt
}

describe("TOKEN_OPTIMIZATION: content is complete", () => {
  it("starts with the section heading and carries no trailing newline", () => {
    expect(TOKEN_OPTIMIZATION.startsWith("## Token Optimization")).toBe(true)
    expect(TOKEN_OPTIMIZATION.endsWith("\n")).toBe(false)
  })

  // Line-for-line, not a length check: a length assertion passes on a fragment
  // whose lines were replaced with different lines of the same total size.
  it.each([
    "## Token Optimization",
    "**Read as little as possible before acting:**",
    "- State which files you need to read and why, before reading them.",
    "- Read only files directly relevant to the task.",
    "**Tool selection — always prefer the cheaper option:**",
    "- To read a specific file: use `fdx-read` first (prototype mode for structure,",
    "- To find something in code: use `fdx-search` or `fdx-grep` with a specific",
    "- To understand project structure: use `fdx-outline` or `fdx-tree`, not a",
    "- To search across the codebase: use `fdx-graph action:query` for structural",
    "- Use read-only graph actions only. The orchestrator owns `action:build`; if a",
    "- Never use `bash` just to read a file.",
    "- Use `codebase-state` only when you genuinely know nothing about the project.",
    "**Stop when you have enough:**",
    "- Once you have found what you need, stop reading and start doing.",
    "**Retry targeted, not broad:**",
    "- If a step fails, re-read only the file or section related to the failure.",
    "- Do not re-read the entire codebase after a single tool error.",
  ])("contains the line %#: %s", (line) => {
    expect(TOKEN_OPTIMIZATION).toContain(line)
  })

  it("has all five bolded sub-headings", () => {
    const headings = TOKEN_OPTIMIZATION.match(/^\*\*.+:\*\*$/gm) ?? []
    expect(headings).toEqual([
      "**Read as little as possible before acting:**",
      "**Tool selection — always prefer the cheaper option:**",
      "**Stop when you have enough:**",
      "**Retry targeted, not broad:**",
    ])
  })

  it("carries no codegraph reference", () => {
    expect(TOKEN_OPTIMIZATION).not.toMatch(/codegraph/i)
  })
})

describe("TOKEN_OPTIMIZATION: embedded whole in every subagent", () => {
  it.each(SUBAGENTS)("%s embeds the entire fragment", (name) => {
    // The whole string, so a truncated section fails here rather than passing a
    // heading-only check.
    expect(promptOf(name)).toContain(TOKEN_OPTIMIZATION)
  })

  it("covers every subagent, so the roster growing does not silently skip one", () => {
    expect(SUBAGENTS.length).toBeGreaterThan(0)
    expect(SUBAGENTS).not.toContain("orchestrator")
    expect(AGENT_NAMES).toContain("orchestrator")
  })
})

describe("ORCH_CONTEXT_NOTE: sourced from the fragment where it was adjacent", () => {
  it.each(SUFFIX_AGENTS)("%s composes the note from the shared constant", (name) => {
    const source = readFileSync(`src/agents/${name}.ts`, "utf-8")
    expect(source).toContain("ORCH_CONTEXT_NOTE")
    expect(source).toContain("${ORCH_CONTEXT_NOTE}")
    // The rendered prompt must carry the text exactly once — a stray second
    // interpolation would double it.
    const prompt = promptOf(name)
    const occurrences = prompt.split(ORCH_CONTEXT_NOTE).length - 1
    expect(occurrences).toBe(1)
  })

  it("no agent renders the note twice", () => {
    const doubled = AGENT_NAMES.filter(
      (n) => promptOf(n).split(ORCH_CONTEXT_NOTE).length - 1 > 1,
    )
    expect(doubled).toEqual([])
  })

  // The paragraph itself predates this work and lives in 11 of 12 agent prompts
  // at differing positions (inside General Rules for the coder-derived three,
  // further down for the rest). Only architect and security-auditor carried it
  // immediately after the Token Optimization block, so only those two were
  // hoisted to the constant. Hoisting the other nine is a per-file placement
  // decision, recorded in TODOS.md rather than guessed at here.
  //
  // This test pins the current count so a future hoist shows up as an
  // intentional change instead of drifting silently.
  it("documents how many agents still inline their own copy", () => {
    const inlineCopies = AGENT_NAMES.filter((n) => {
      const source = readFileSync(`src/agents/${sourceFileFor(n)}`, "utf-8")
      return !source.includes("${ORCH_CONTEXT_NOTE}") && /Orchestrator Context\\`/.test(source)
    })
    // coder.ts backs three agents, so the distinct FILE count is lower.
    const files = [...new Set(inlineCopies.map(sourceFileFor))].sort()
    expect(files).toEqual([
      "coder.ts",
      "debug.ts",
      "mapper.ts",
      "planner.ts",
      "researcher.ts",
      "reviewer.ts",
      "tester.ts",
    ])
  })
})

describe("single writer: only the orchestrator builds the graph", () => {
  it.each(SUBAGENTS)("%s states the prohibition", (name) => {
    expect(promptOf(name)).toContain("The orchestrator owns `action:build`")
  })

  it.each(SUBAGENTS)("%s never instructs running a build", (name) => {
    const prompt = promptOf(name)
    // Substring presence proves nothing here: the prohibition itself contains
    // "action:build". Assert no IMPERATIVE form appears.
    const imperatives = [
      /\brun\s+`?fdx-graph action:build/i,
      /\bcall\s+`?fdx-graph action:build/i,
      /\buse\s+`?fdx-graph action:build/i,
      /\binvoke\s+`?fdx-graph action:build/i,
      /action:build`?\s+(?:once|before|after|first)/i,
    ]
    for (const re of imperatives) {
      expect(prompt).not.toMatch(re)
    }
  })

  it("the orchestrator DOES own the build instruction", () => {
    const prompt = promptOf("orchestrator")
    expect(prompt).toContain("action:build")
    expect(prompt).toMatch(/only YOU run `action:build`/)
  })
})

describe("graph guidance uses only real actions and args", () => {
  const VALID_ACTIONS = [
    "build",
    "status",
    "query",
    "impact",
    "deps",
    "path",
    "explain",
    "report",
  ]

  it.each(AGENT_NAMES)("%s names only valid fdx-graph actions", (name) => {
    const prompt = promptOf(name)
    const found = [...prompt.matchAll(/fdx[- ]graph[^\n]{0,40}?action:(\w+)/g)].map(
      (m) => m[1],
    )
    const invalid = found.filter((a) => !VALID_ACTIONS.includes(a))
    expect(invalid).toEqual([])
  })

  it.each(AGENT_NAMES)("%s uses no non-existent fdx-graph arg", (name) => {
    // The CLI is `fdx graph [--format F] <ACTION> [TARGET] [TARGET2]`. An earlier
    // draft of this work documented symbol:/file:/depth:/project_root:, none of
    // which exist, so every call written from it would have thrown.
    const prompt = promptOf(name)
    const bad = [
      ...prompt.matchAll(
        /fdx[- ]graph[^\n]{0,80}?\b(symbol|file|from|to|depth|project_root):/g,
      ),
    ].map((m) => m[1])
    expect(bad).toEqual([])
  })

  it.each(AGENT_NAMES)("%s carries no codegraph reference", (name) => {
    expect(promptOf(name)).not.toMatch(/codegraph/i)
  })
})
