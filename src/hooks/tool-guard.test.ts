import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { toolGuardHook } from "./tool-guard"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"

const TMP = join(process.cwd(), "tmp-test-guard")

describe("toolGuardHook - Phase Enforcement", () => {
  beforeEach(() => {
    process.env.FLOWDECK_TOOL_GUARD_ENABLED = "on"
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })
    if (!existsSync(join(TMP, ".planning"))) mkdirSync(join(TMP, ".planning"), { recursive: true })
  })

  afterEach(() => {
    delete process.env.FLOWDECK_TOOL_GUARD_ENABLED
    rmSync(TMP, { recursive: true, force: true })
  })

  it("blocks write tool in discuss phase (phase 1)", async () => {
    writeFileSync(join(TMP, ".planning", "STATE.md"), "phase: 1\nstatus: planned")
    
    const ctx = { directory: TMP }
    const input = { tool: "write" }
    const output = { args: { filePath: "src/index.ts" } }

    await expect(toolGuardHook(ctx, input, output)).rejects.toThrow(/blocked in phase 1/)
  })

  it("blocks edit tool in plan phase (phase 2)", async () => {
    writeFileSync(join(TMP, ".planning", "STATE.md"), "phase: 2\nstatus: planned")
    
    const ctx = { directory: TMP }
    const input = { tool: "edit" }
    const output = { args: { filePath: "src/index.ts" } }

    await expect(toolGuardHook(ctx, input, output)).rejects.toThrow(/blocked in phase 2/)
  })

  it("allows write tool in execute phase (phase 3)", async () => {
    writeFileSync(join(TMP, ".planning", "STATE.md"), "phase: 3\nstatus: in_progress\nrequires_design_first: false")
    
    const ctx = { directory: TMP }
    const input = { tool: "write" }
    const output = { args: { filePath: "src/index.ts" } }

    await toolGuardHook(ctx, input, output)
  })

  it("blocks write tool for UI-heavy plans without approved design handoff", async () => {
    mkdirSync(join(TMP, ".planning", "phases", "phase-3"), { recursive: true })
    writeFileSync(
      join(TMP, ".planning", "STATE.md"),
      "phase: 3\nstatus: in_progress\nrequires_design_first: true\ndesign_stage: \"pending\"\ndesign_approved: false\ndesign_override: false",
    )
    writeFileSync(
      join(TMP, ".planning", "phases", "phase-3", "PLAN.md"),
      "# PLAN\n- Build a landing page with responsive sections and CTA flow\n",
    )

    const ctx = { directory: TMP }
    const input = { tool: "write" }
    const output = { args: { filePath: "src/ui.tsx" } }

    await expect(toolGuardHook(ctx, input, output)).rejects.toThrow(/design-gate/)
  })

  it("allows write tool for UI-heavy plans with explicit override reason", async () => {
    mkdirSync(join(TMP, ".planning", "phases", "phase-3"), { recursive: true })
    writeFileSync(
      join(TMP, ".planning", "STATE.md"),
      "phase: 3\nstatus: in_progress\nrequires_design_first: true\ndesign_stage: \"pending\"\ndesign_approved: false\ndesign_override: true\ndesign_override_reason: \"urgent hotfix\"",
    )
    writeFileSync(
      join(TMP, ".planning", "phases", "phase-3", "PLAN.md"),
      "# PLAN\n- Build admin panel settings page\n",
    )

    const ctx = { directory: TMP }
    const input = { tool: "write" }
    const output = { args: { filePath: "src/ui.tsx" } }

    await toolGuardHook(ctx, input, output)
  })

  it("allows read tool in any phase", async () => {
    writeFileSync(join(TMP, ".planning", "STATE.md"), "phase: 1\nstatus: planned")
    
    const ctx = { directory: TMP }
    const input = { tool: "read" }
    const output = { args: { filePath: "src/index.ts" } }

    await toolGuardHook(ctx, input, output)
  })
})
