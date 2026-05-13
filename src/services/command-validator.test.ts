import { describe, it, expect } from "bun:test"
import {
  isValidCommand,
  validateCommandReference,
  extractCommandReferences,
  extractBarePrefixErrors,
  auditTextForInvalidCommands,
  rewriteInvalidCommandRefs,
  getCommandInventory,
} from "./command-validator"

// All 21 registered commands
const VALID_COMMANDS = [
  "fd-ask", "fd-checkpoint", "fd-deploy-check", "fd-design", "fd-discuss",
  "fd-doctor", "fd-execute", "fd-fix-bug", "fd-map-codebase", "fd-multi-repo",
  "fd-new-feature", "fd-new-project", "fd-plan", "fd-quick", "fd-reflect",
  "fd-resume", "fd-status", "fd-suggest", "fd-translate-intent", "fd-verify",
  "fd-write-docs",
]

describe("getCommandInventory", () => {
  it("returns all 21 registered commands", () => {
    const inventory = getCommandInventory()
    expect(inventory).toHaveLength(21)
  })

  it("contains every expected command", () => {
    const inventory = getCommandInventory()
    for (const cmd of VALID_COMMANDS) {
      expect(inventory).toContain(cmd)
    }
  })

  it("does not contain phantom commands", () => {
    const inventory = getCommandInventory()
    const phantoms = [
      "fd-blast-radius", "fd-impact-radar", "fd-review-route",
      "fd-regression-predict", "fd-test-gap", "fd-volatility-map",
      "fd-review-code",
    ]
    for (const phantom of phantoms) {
      expect(inventory).not.toContain(phantom)
    }
  })
})

describe("isValidCommand", () => {
  it("returns true for all registered commands with slash", () => {
    for (const cmd of VALID_COMMANDS) {
      expect(isValidCommand(`/${cmd}`)).toBe(true)
    }
  })

  it("returns true for all registered commands without slash", () => {
    for (const cmd of VALID_COMMANDS) {
      expect(isValidCommand(cmd)).toBe(true)
    }
  })

  it("returns false for phantom commands", () => {
    expect(isValidCommand("/fd-blast-radius")).toBe(false)
    expect(isValidCommand("/fd-impact-radar")).toBe(false)
    expect(isValidCommand("/fd-review-route")).toBe(false)
    expect(isValidCommand("/fd-regression-predict")).toBe(false)
    expect(isValidCommand("/fd-test-gap")).toBe(false)
    expect(isValidCommand("/fd-volatility-map")).toBe(false)
    expect(isValidCommand("/fd-review-code")).toBe(false)
  })

  it("returns false for bare names (missing fd- prefix)", () => {
    expect(isValidCommand("/plan")).toBe(false)
    expect(isValidCommand("/discuss")).toBe(false)
    expect(isValidCommand("/new-project")).toBe(false)
    expect(isValidCommand("/execute")).toBe(false)
  })
})

describe("validateCommandReference", () => {
  it("returns valid=true for registered commands", () => {
    const result = validateCommandReference("/fd-plan")
    expect(result.valid).toBe(true)
    expect(result.command).toBe("/fd-plan")
    expect(result.reason).toBeUndefined()
  })

  it("suggests fd- prefix for bare names", () => {
    const result = validateCommandReference("/plan")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("/fd-plan")
  })

  it("returns error for fully phantom commands", () => {
    const result = validateCommandReference("/fd-blast-radius")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("not a registered FlowDeck command")
  })
})

describe("extractCommandReferences", () => {
  it("extracts all /fd-* references from text", () => {
    const text = "Run /fd-plan then /fd-execute and finally /fd-verify."
    const refs = extractCommandReferences(text)
    expect(refs).toContain("/fd-plan")
    expect(refs).toContain("/fd-execute")
    expect(refs).toContain("/fd-verify")
  })

  it("deduplicates repeated references", () => {
    const text = "Use /fd-plan. Then /fd-plan again."
    const refs = extractCommandReferences(text)
    expect(refs.filter(r => r === "/fd-plan")).toHaveLength(1)
  })

  it("returns empty array when no /fd-* references", () => {
    const refs = extractCommandReferences("No commands here.")
    expect(refs).toHaveLength(0)
  })

  it("does not extract bare non-fd commands", () => {
    const refs = extractCommandReferences("Run /plan and /discuss")
    expect(refs).toHaveLength(0)
  })
})

describe("extractBarePrefixErrors", () => {
  it("detects bare /plan that should be /fd-plan", () => {
    const errors = extractBarePrefixErrors("Run /plan first.")
    expect(errors).toContain("/plan")
  })

  it("detects bare /discuss that should be /fd-discuss", () => {
    const errors = extractBarePrefixErrors("Run /discuss to clarify.")
    expect(errors).toContain("/discuss")
  })

  it("detects bare /new-project", () => {
    const errors = extractBarePrefixErrors("Run /new-project first.")
    expect(errors).toContain("/new-project")
  })

  it("does not flag valid /fd-* commands", () => {
    const errors = extractBarePrefixErrors("Run /fd-plan then /fd-execute.")
    expect(errors).toHaveLength(0)
  })

  it("does not flag non-command words after slash (e.g. URL paths)", () => {
    // Words that don't correspond to fd- commands should not be flagged
    const errors = extractBarePrefixErrors("See /api/users endpoint.")
    expect(errors).not.toContain("/api")
  })
})

describe("auditTextForInvalidCommands", () => {
  it("returns clean audit for text with only valid commands", () => {
    const audit = auditTextForInvalidCommands("Run /fd-plan then /fd-verify")
    expect(audit.hasInvalid).toBe(false)
    expect(audit.valid).toHaveLength(2)
    expect(audit.invalid).toHaveLength(0)
  })

  it("flags phantom /fd-blast-radius as invalid", () => {
    const audit = auditTextForInvalidCommands("Use /fd-blast-radius to check impact.")
    expect(audit.hasInvalid).toBe(true)
    expect(audit.invalid[0].command).toBe("/fd-blast-radius")
  })

  it("flags multiple phantom commands", () => {
    const audit = auditTextForInvalidCommands(
      "Use /fd-impact-radar and /fd-regression-predict before merging."
    )
    expect(audit.hasInvalid).toBe(true)
    expect(audit.invalid).toHaveLength(2)
  })

  it("mixes valid and invalid correctly", () => {
    const audit = auditTextForInvalidCommands(
      "Run /fd-plan, then /fd-impact-radar, then /fd-verify"
    )
    expect(audit.valid.map(v => v.command)).toContain("/fd-plan")
    expect(audit.valid.map(v => v.command)).toContain("/fd-verify")
    expect(audit.invalid.map(v => v.command)).toContain("/fd-impact-radar")
  })
})

describe("rewriteInvalidCommandRefs", () => {
  it("leaves valid commands unchanged", () => {
    const result = rewriteInvalidCommandRefs("Run /fd-plan and /fd-verify.")
    expect(result).toBe("Run /fd-plan and /fd-verify.")
  })

  it("appends (unavailable) to phantom commands", () => {
    const result = rewriteInvalidCommandRefs("Run /fd-blast-radius to preview.")
    expect(result).toContain("/fd-blast-radius (unavailable)")
  })

  it("preserves valid commands next to invalid ones", () => {
    const result = rewriteInvalidCommandRefs("Use /fd-plan then /fd-impact-radar.")
    expect(result).toContain("/fd-plan")
    expect(result).not.toContain("/fd-plan (unavailable)")
    expect(result).toContain("/fd-impact-radar (unavailable)")
  })
})

describe("agent prompt integrity", () => {
  it("orchestrator.ts contains only valid command references", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/agents/orchestrator.ts", "utf-8")
    const audit = auditTextForInvalidCommands(content)
    expect(audit.hasInvalid).toBe(false)
  })

  it("specialist.ts contains only valid command references", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/agents/specialist.ts", "utf-8")
    const audit = auditTextForInvalidCommands(content)
    expect(audit.hasInvalid).toBe(false)
  })

  it("guard-rails.ts contains only valid command references", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/hooks/guard-rails.ts", "utf-8")
    const audit = auditTextForInvalidCommands(content)
    expect(audit.hasInvalid).toBe(false)
  })

  it("session-start.ts contains only valid command references", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/hooks/session-start.ts", "utf-8")
    const audit = auditTextForInvalidCommands(content)
    expect(audit.hasInvalid).toBe(false)
  })
})

describe("skill file integrity", () => {
  const skills = [
    "src/skills/blast-radius-preview/SKILL.md",
    "src/skills/change-impact-radar/SKILL.md",
    "src/skills/human-review-routing/SKILL.md",
    "src/skills/intent-translator/SKILL.md",
    "src/skills/confidence-aware-planning/SKILL.md",
    "src/skills/context-load/SKILL.md",
    "src/skills/regression-prediction/SKILL.md",
    "src/skills/test-gap-detector/SKILL.md",
    "src/skills/volatility-map/SKILL.md",
  ]

  for (const skillPath of skills) {
    it(`${skillPath} contains only valid command references`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(skillPath, "utf-8")
      const audit = auditTextForInvalidCommands(content)
      if (audit.hasInvalid) {
        const names = audit.invalid.map(i => i.command).join(", ")
        throw new Error(`${skillPath} references invalid commands: ${names}`)
      }
      expect(audit.hasInvalid).toBe(false)
    })
  }
})

describe("command file integrity", () => {
  const commandFiles = [
    "src/commands/fd-multi-repo.md",
    "src/commands/fd-plan.md",
    "src/commands/fd-discuss.md",
  ]

  for (const filePath of commandFiles) {
    it(`${filePath} contains only valid command references`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(filePath, "utf-8")
      const audit = auditTextForInvalidCommands(content)
      if (audit.hasInvalid) {
        const names = audit.invalid.map(i => i.command).join(", ")
        throw new Error(`${filePath} references invalid commands: ${names}`)
      }
      expect(audit.hasInvalid).toBe(false)
    })
  }
})
