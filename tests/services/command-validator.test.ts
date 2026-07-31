import { describe, it, expect } from "bun:test"
import {
  isValidCommand,
  validateCommandReference,
  extractCommandReferences,
  extractBarePrefixErrors,
  auditTextForInvalidCommands,
  auditTextFull,
  rewriteInvalidCommandRefs,
  getCommandInventory,
} from "@/services/command-validator"
import { REGISTERED_COMMANDS } from "@/services/supervisor-binding"
import { AGENT_NAMES } from "@/agents/index"
import { readdirSync } from "fs"

// The 8 registered commands
const VALID_COMMANDS = [
  "fd-task", "fd-review", "fd-execute", "fd-verify", "fd-done",
  "fd-checkpoint", "fd-resume", "fd-status",
]

describe("getCommandInventory", () => {
  it("returns all 8 registered commands", () => {
    const inventory = getCommandInventory()
    expect(inventory).toHaveLength(8)
  })

  it("contains every expected command", () => {
    const inventory = getCommandInventory()
    for (const cmd of VALID_COMMANDS) {
      expect(inventory).toContain(cmd)
    }
  })

  it("does not contain fd-new-project", () => {
    const inventory = getCommandInventory()
    expect(inventory).not.toContain("fd-new-project")
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
    expect(isValidCommand("/task")).toBe(false)
    expect(isValidCommand("/review")).toBe(false)
    expect(isValidCommand("/new-project")).toBe(false)
    expect(isValidCommand("/execute")).toBe(false)
  })

  it("fd-new-project is no longer registered", () => {
    expect(isValidCommand("/fd-new-project")).toBe(false)
    expect(isValidCommand("fd-new-project")).toBe(false)
  })
})

describe("validateCommandReference", () => {
  it("returns valid=true for registered commands", () => {
    const result = validateCommandReference("/fd-task")
    expect(result.valid).toBe(true)
    expect(result.command).toBe("/fd-task")
    expect(result.reason).toBeUndefined()
  })

  it("suggests fd- prefix for bare names", () => {
    const result = validateCommandReference("/task")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("/fd-task")
  })

  it("returns error for fully phantom commands", () => {
    const result = validateCommandReference("/fd-blast-radius")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("not a registered FlowDeck command")
  })
})

describe("extractCommandReferences", () => {
  it("extracts all /fd-* references from text", () => {
    const text = "Run /fd-task then /fd-execute and finally /fd-verify."
    const refs = extractCommandReferences(text)
    expect(refs).toContain("/fd-task")
    expect(refs).toContain("/fd-execute")
    expect(refs).toContain("/fd-verify")
  })

  it("deduplicates repeated references", () => {
    const text = "Use /fd-task. Then /fd-task again."
    const refs = extractCommandReferences(text)
    expect(refs.filter(r => r === "/fd-task")).toHaveLength(1)
  })

  it("returns empty array when no /fd-* references", () => {
    const refs = extractCommandReferences("No commands here.")
    expect(refs).toHaveLength(0)
  })

  it("does not extract bare non-fd commands", () => {
    const refs = extractCommandReferences("Run /task and /review")
    expect(refs).toHaveLength(0)
  })
})

describe("extractBarePrefixErrors", () => {
  it("detects bare /task that should be /fd-task", () => {
    const errors = extractBarePrefixErrors("Run /task first.")
    expect(errors).toContain("/task")
  })

  it("detects bare /review that should be /fd-review", () => {
    const errors = extractBarePrefixErrors("Run /review to clarify.")
    expect(errors).toContain("/review")
  })

  it("detects bare /new-project", () => {
    // /new-project is no longer a bare-prefix error because fd-new-project is removed
    const errors = extractBarePrefixErrors("Run /new-project first.")
    expect(errors).not.toContain("/new-project")
  })

  it("does not flag valid /fd-* commands", () => {
    const errors = extractBarePrefixErrors("Run /fd-task then /fd-execute.")
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
    const audit = auditTextForInvalidCommands("Run /fd-task then /fd-verify")
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
      "Run /fd-task, then /fd-impact-radar, then /fd-verify"
    )
    expect(audit.valid.map(v => v.command)).toContain("/fd-task")
    expect(audit.valid.map(v => v.command)).toContain("/fd-verify")
    expect(audit.invalid.map(v => v.command)).toContain("/fd-impact-radar")
  })
})

describe("rewriteInvalidCommandRefs", () => {
  it("leaves valid commands unchanged", () => {
    const result = rewriteInvalidCommandRefs("Run /fd-task and /fd-verify.")
    expect(result).toBe("Run /fd-task and /fd-verify.")
  })

  it("appends (unavailable) to phantom commands", () => {
    const result = rewriteInvalidCommandRefs("Run /fd-blast-radius to preview.")
    expect(result).toContain("/fd-blast-radius (unavailable)")
  })

  it("preserves valid commands next to invalid ones", () => {
    const result = rewriteInvalidCommandRefs("Use /fd-task then /fd-impact-radar.")
    expect(result).toContain("/fd-task")
    expect(result).not.toContain("/fd-task (unavailable)")
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
    "src/skills/test-gap-detector/SKILL.md",
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
    "src/commands/fd-task.md",
    "src/commands/fd-review.md",
    "src/commands/fd-execute.md",
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

// ─── auditTextFull: combined /fd-* + bare-prefix audit ───────────────────────

describe("auditTextFull", () => {
  it("flags bare /execute as a prefix error", () => {
    const audit = auditTextFull("Run /execute to implement.")
    expect(audit.hasAnyIssue).toBe(true)
    expect(audit.barePrefixErrors).toContain("/execute")
  })

  it("does not flag a glob path segment as a bare command", () => {
    const audit = auditTextFull("Read `~/.fd-plan/<slug>/*/task.md` for prior topics.")
    expect(audit.barePrefixErrors).toHaveLength(0)
  })

  it("flags invalid /fd-blast-radius as an invalid fd command", () => {
    const audit = auditTextFull("Use /fd-blast-radius here.")
    expect(audit.hasAnyIssue).toBe(true)
    expect(audit.hasInvalid).toBe(true)
  })

  it("returns no issues for clean text with only valid commands", () => {
    const audit = auditTextFull("Run /fd-task then /fd-verify.")
    expect(audit.hasAnyIssue).toBe(false)
    expect(audit.barePrefixErrors).toHaveLength(0)
    expect(audit.hasInvalid).toBe(false)
  })

  it("returns no issues for text with no slash commands", () => {
    const audit = auditTextFull("No commands mentioned here.")
    expect(audit.hasAnyIssue).toBe(false)
  })
})

// ─── Full audit: agent files (bare-prefix + invalid /fd-* combined) ──────────

const agentFiles = readdirSync("src/agents")
  .filter((f) => f.endsWith(".ts") && !["index.ts", "types.ts", "routing.ts"].includes(f))
  .map((f) => `src/agents/${f}`)

describe("full agent prompt integrity (no invalid or bare-prefix commands)", () => {
  for (const filePath of agentFiles) {
    it(`${filePath} passes full command audit`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(filePath, "utf-8")
      const audit = auditTextFull(content)
      if (audit.hasInvalid) {
        const names = audit.invalid.map(i => i.command).join(", ")
        throw new Error(`${filePath} references invalid /fd-* commands: ${names}`)
      }
      if (audit.barePrefixErrors.length > 0) {
        throw new Error(`${filePath} uses bare command references (missing fd- prefix): ${audit.barePrefixErrors.join(", ")}`)
      }
      expect(audit.hasAnyIssue).toBe(false)
    })
  }
})

describe("full hook integrity (no invalid or bare-prefix commands)", () => {
  const hookFiles = [
    "src/hooks/session-start.ts",
  ]
  for (const filePath of hookFiles) {
    it(`${filePath} passes full command audit`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(filePath, "utf-8")
      const audit = auditTextFull(content)
      if (audit.hasInvalid) {
        const names = audit.invalid.map(i => i.command).join(", ")
        throw new Error(`${filePath} references invalid /fd-* commands: ${names}`)
      }
      if (audit.barePrefixErrors.length > 0) {
        throw new Error(`${filePath} uses bare command references (missing fd- prefix): ${audit.barePrefixErrors.join(", ")}`)
      }
      expect(audit.hasAnyIssue).toBe(false)
    })
  }
})

describe("full command file integrity (no invalid or bare-prefix commands)", () => {
  const { readdirSync } = require("fs")
  let allCommandFiles: string[] = []
  try {
    allCommandFiles = readdirSync("src/commands")
      .filter((f: string) => f.endsWith(".md"))
      .map((f: string) => `src/commands/${f}`)
  } catch { /* directory not found in test env */ }

  for (const filePath of allCommandFiles) {
    it(`${filePath} passes full command audit`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(filePath, "utf-8")
      const audit = auditTextFull(content)
      if (audit.hasInvalid) {
        const names = audit.invalid.map(i => i.command).join(", ")
        throw new Error(`${filePath} references invalid /fd-* commands: ${names}`)
      }
      if (audit.barePrefixErrors.length > 0) {
        throw new Error(`${filePath} uses bare command references (missing fd- prefix): ${audit.barePrefixErrors.join(", ")}`)
      }
      expect(audit.hasAnyIssue).toBe(false)
    })
  }
})

describe("full skill integrity (no invalid or bare-prefix commands)", () => {
  const { readdirSync, existsSync } = require("fs")
  const { join } = require("path")
  const skillsDir = "src/skills"
  let allSkillFiles: string[] = []
  try {
    for (const skillName of readdirSync(skillsDir)) {
      const skillMd = join(skillsDir, skillName, "SKILL.md")
      if (existsSync(skillMd)) allSkillFiles.push(skillMd)
    }
  } catch { /* directory not found in test env */ }

  for (const filePath of allSkillFiles) {
    it(`${filePath} passes full command audit`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(filePath, "utf-8")
      const audit = auditTextFull(content)
      if (audit.hasInvalid) {
        const names = audit.invalid.map(i => i.command).join(", ")
        throw new Error(`${filePath} references invalid /fd-* commands: ${names}`)
      }
      if (audit.barePrefixErrors.length > 0) {
        throw new Error(`${filePath} uses bare command references (missing fd- prefix): ${audit.barePrefixErrors.join(", ")}`)
      }
      expect(audit.hasAnyIssue).toBe(false)
    })
  }
})

// ─── Command vocabulary vs skill vocabulary ───────────────────────────────────

describe("command vocabulary vs skill vocabulary", () => {
  it("skill directory names are not slash commands", async () => {
    const { readdirSync } = await import("fs")
    let skillNames: string[] = []
    try {
      skillNames = readdirSync("src/skills") as string[]
    } catch { return }
    for (const skillName of skillNames) {
      expect(isValidCommand(`/${skillName}`)).toBe(false)
    }
  })

  it("agent names are not slash commands", () => {
    for (const agentName of AGENT_NAMES) {
      expect(isValidCommand(`/${agentName}`)).toBe(false)
    }
  })

  it("REGISTERED_COMMANDS and AGENT_NAMES have no overlap", () => {
    const cmdSet = new Set(REGISTERED_COMMANDS)
    for (const agent of AGENT_NAMES) {
      expect(cmdSet.has(agent)).toBe(false)
    }
  })
})

// ─── Legacy gsd-* names are rejected ─────────────────────────────────────────

describe("legacy gsd-* names are not valid commands", () => {
  const legacyNames = [
    "/gsd-quick", "/gsd-plan", "/gsd-execute", "/gsd-verify",
    "/fd-gsd-quick", "/fd-gsd-plan",
  ]

  for (const name of legacyNames) {
    it(`${name} is not a registered command`, () => {
      expect(isValidCommand(name)).toBe(false)
    })
  }

  it("no REGISTERED_COMMANDS entry starts with gsd", () => {
    for (const cmd of REGISTERED_COMMANDS) {
      expect(cmd.startsWith("gsd")).toBe(false)
    }
  })
})

// ─── AGENTS.md does not introduce invalid command names ───────────────────────

describe("AGENTS.md command reference audit", () => {
  it("AGENTS.md contains only valid /fd-* command references", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("AGENTS.md", "utf-8")
    const audit = auditTextForInvalidCommands(content)
    if (audit.hasInvalid) {
      const names = audit.invalid.map(i => i.command).join(", ")
      throw new Error(`AGENTS.md references invalid commands: ${names}`)
    }
    expect(audit.hasInvalid).toBe(false)
  })
})

describe("fd-new-project removal", () => {
  it("fd-new-project is NOT in REGISTERED_COMMANDS", () => {
    expect((REGISTERED_COMMANDS as readonly string[])).not.toContain("fd-new-project")
  })

  it("/fd-new-project is not a valid command", () => {
    expect(isValidCommand("/fd-new-project")).toBe(false)
    expect(isValidCommand("fd-new-project")).toBe(false)
  })

  it("orchestrator.ts does not reference /fd-new-project", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/agents/orchestrator.ts", "utf-8")
    expect(content).not.toContain("/fd-new-project")
  })
  it("session-start.ts does not reference /fd-new-project", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/hooks/session-start.ts", "utf-8")
    expect(content).not.toContain("fd-new-project")
  })

  it("fd-new-project command file does not exist", async () => {
    const { existsSync } = await import("fs")
    expect(existsSync("src/commands/fd-new-project.md")).toBe(false)
  })

  it("fd-task.md auto-inits the workspace instead of delegating to another command", async () => {
    const { readFileSync } = await import("fs")
    const content = readFileSync("src/commands/fd-task.md", "utf-8")
    expect(content).not.toContain("fd-new-project")
    expect(content).toContain("Auto-init")
    expect(content).toContain("architecture.md")
  })
})

// ─── "run X first" guidance uses valid commands ───────────────────────────────

describe("run-X-first guidance references valid registered commands", () => {
  const filesToCheck = [
    "src/hooks/session-start.ts",
    "src/agents/orchestrator.ts",
  ]

  for (const filePath of filesToCheck) {
    it(`${filePath} — all 'Run /fd-*' guidance targets valid commands`, async () => {
      const { readFileSync } = await import("fs")
      const content = readFileSync(filePath, "utf-8")
      const runCmdPattern = /[Rr]un [`'"]?\/fd-[a-z][a-z0-9-]*/g
      const runMatches = content.match(runCmdPattern) ?? []
      for (const match of runMatches) {
        const cmdRef = match.match(/\/fd-[a-z][a-z0-9-]*/)?.[0]
        if (cmdRef) {
          expect(isValidCommand(cmdRef)).toBe(true)
        }
      }
    })
  }
})
