/**
 * Skill Registry Tests
 *
 * Covers:
 * - The orchestrator is unrestricted and gets no gate block
 * - Restricted agents get exactly the skills their role needs, and nothing else
 * - `buildSkillGate()` renders the MUST NOT instruction agents self-enforce against
 * - Every non-orchestrator agent in AGENT_NAMES has a registry entry
 * - Every skill name in the registry actually exists in src/skills/
 *
 * Why the last case exists: enforcement is by prompt, so a typo'd or invented
 * skill name fails silently — the agent is simply told it may load something
 * that does not exist, and the real skill it needed is denied by omission. The
 * original spec for this registry listed `context-steward-triggers` for 11 of
 * 12 agents; no such skill has ever existed on disk.
 */

import { describe, it, expect } from "vitest"
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import {
  SKILL_REGISTRY,
  getAllowedSkills,
  buildSkillGate,
} from "@/services/skill-registry"
import { AGENT_NAMES } from "@/agents/index"

const SKILLS_DIR = join(__dirname, "..", "..", "src", "skills")

/** Skill directory names present on disk. */
function skillsOnDisk(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, "SKILL.md")))
    .map(e => e.name)
}

describe("skill-registry", () => {
  it("orchestrator is unrestricted", () => {
    expect(getAllowedSkills("orchestrator")).toBeNull()
    expect(buildSkillGate("orchestrator")).toBe("")
  })

  it("tester only gets tdd-workflow, test-gap-detector, django-tdd, context-steward", () => {
    expect(getAllowedSkills("tester")).toEqual([
      "tdd-workflow",
      "test-gap-detector",
      "django-tdd",
      "context-steward",
    ])
  })

  it("security-auditor cannot load backend-patterns", () => {
    const skills = getAllowedSkills("security-auditor")
    expect(skills).not.toContain("backend-patterns")
    expect(skills).toContain("security-scan")
  })

  it("buildSkillGate returns MUST NOT instruction for restricted agents", () => {
    const gate = buildSkillGate("tester")
    expect(gate).toContain("MUST NOT load any skill not in this list")
    expect(gate).toContain("tdd-workflow")
    expect(gate).not.toContain("security-scan")
  })

  it("every non-orchestrator agent has an entry", () => {
    const agents = AGENT_NAMES.filter(a => a !== "orchestrator")
    expect(agents).toHaveLength(11)
    for (const a of agents) {
      expect(SKILL_REGISTRY[a], `${a} has no skill-registry entry`).toBeDefined()
      expect(getAllowedSkills(a), `${a} resolved to unrestricted`).not.toBeNull()
    }
  })

  it("unknown agents resolve to no gate rather than an empty allowlist", () => {
    expect(getAllowedSkills("no-such-agent")).toBeNull()
    expect(buildSkillGate("no-such-agent")).toBe("")
  })

  it("every skill named in the registry exists in src/skills/", () => {
    const onDisk = new Set(skillsOnDisk())
    expect(onDisk.size).toBeGreaterThan(0)

    const missing: string[] = []
    for (const [agent, entry] of Object.entries(SKILL_REGISTRY)) {
      if (entry === "*") continue
      for (const skill of entry) {
        if (!onDisk.has(skill)) missing.push(`${agent} -> ${skill}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("no agent lists the same skill twice", () => {
    for (const [agent, entry] of Object.entries(SKILL_REGISTRY)) {
      if (entry === "*") continue
      expect(new Set(entry).size, `${agent} has duplicate skills`).toBe(entry.length)
    }
  })
})
