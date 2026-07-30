import { describe, it, expect } from "vitest"
import { fdxGraphTool } from "@/tools/fdx"

/**
 * The fdx-graph wrapper has two guard clauses that had no coverage: actions that
 * need a `target`, and `path` needing a second one. Both throw BEFORE spawning
 * the binary, so these run without fdx installed.
 *
 * The action list is duplicated across the zod enum here,
 * FDX_GRAPH_ALLOWED_ACTIONS in the orchestrator guard, and the clap dispatch in
 * crates/fdx/src/main.rs. tests/hooks/orchestrator-guard.test.ts asserts the
 * guard side; this asserts the wrapper side.
 */
const TARGET_TAKING = ["query", "impact", "deps", "path", "explain"] as const
const TARGETLESS = ["build", "status", "report"] as const

function run(args: Record<string, unknown>) {
  // The tool's args are validated by the harness in production; here we call
  // execute directly to exercise the guard clauses.
  return (fdxGraphTool as unknown as {
    execute: (a: unknown) => Promise<string>
  }).execute(args)
}

describe("fdx-graph argument validation", () => {
  it("rejects a target-taking action with no target", async () => {
    for (const action of TARGET_TAKING) {
      await expect(run({ action })).rejects.toThrow(/requires `target`/)
    }
  })

  it("rejects action=path with only one target", async () => {
    await expect(run({ action: "path", target: "a" })).rejects.toThrow(/target2/)
  })

  it("names the offending action in the error", async () => {
    await expect(run({ action: "impact" })).rejects.toThrow(/action=impact/)
  })

  it("does not demand a target for build, status, or report", async () => {
    // These must not fail VALIDATION. They may still fail because fdx is absent
    // from PATH in a clean environment, so only the validation message is ruled out.
    for (const action of TARGETLESS) {
      const error = await run({ action }).then(
        () => null,
        (e: Error) => e,
      )
      if (error) {
        expect(error.message).not.toMatch(/requires `target`/)
        expect(error.message).not.toMatch(/target2/)
      }
    }
  })

  it("exposes exactly the actions the CLI implements", () => {
    // Guards against the gap that shipped once already: `impact` was allowlisted
    // in the guard and exposed nowhere, while deps/path/explain/report were
    // implemented in the CLI and unreachable through this wrapper.
    const schema = (fdxGraphTool as unknown as {
      args: { action: { options?: string[]; _def?: { values?: string[] } } }
    }).args
    const options =
      schema.action.options ?? schema.action._def?.values ?? []
    expect([...options].sort()).toEqual(
      [...TARGET_TAKING, ...TARGETLESS].sort(),
    )
  })
})
