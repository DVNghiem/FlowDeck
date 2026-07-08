/**
 * End-to-End Integration Test — Auto-Update Loader
 *
 * Tests the full lifecycle of the plugin loader in src/index.ts:
 *   checkNpmRegistry → npm install (if update) → ensureRepoClone → buildPlugin → loadPluginFromRepo → fallback
 *
 * DESIGN: Uses vi.spyOn (not vi.mock) to intercept plugin-loader exports.
 * This avoids cross-file mock leakage — vi.mock in Bun persists across test
 * files, breaking plugin-loader.test.ts which tests the real module.
 * ES module live bindings ensure spies take effect before dynamic imports of
 * src/index.ts resolve.
 *
 * Temp override: src/index.ts skips the update cycle when NODE_ENV === "test".
 * This test sets NODE_ENV to "development" so the loader runs for real.
 * It is restored in afterAll.
 */

import { vi, describe, it, expect, beforeEach, afterAll } from "vitest"

// ── Module-level spy variables ────────────────────────────────────────────────
// Replaced in beforeEach so each test gets fresh spies.

let checkNpmRegistrySpy: ReturnType<typeof vi.spyOn> | null = null
let ensureRepoCloneSpy: ReturnType<typeof vi.spyOn> | null = null
let buildPluginSpy: ReturnType<typeof vi.spyOn> | null = null
let loadPluginFromRepoSpy: ReturnType<typeof vi.spyOn> | null = null

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auto-update loader end-to-end", () => {
  afterAll(() => {
    // Restore NODE_ENV so other tests see the original value
    process.env.NODE_ENV = "test"
  })

  beforeEach(async () => {
    // Override NODE_ENV so the loader doesn't skip the update cycle
    process.env.NODE_ENV = "development"

    // Import and spy on the real plugin-loader module.
    // ES module live bindings ensure src/index.ts's static imports resolve to
    // the spied versions when dynamically imported later.
    const pluginLoader = await import("../../src/services/plugin-loader")

    checkNpmRegistrySpy?.mockRestore()
    ensureRepoCloneSpy?.mockRestore()
    buildPluginSpy?.mockRestore()
    loadPluginFromRepoSpy?.mockRestore()

    checkNpmRegistrySpy = vi.spyOn(pluginLoader, "checkNpmRegistry")
    ensureRepoCloneSpy = vi.spyOn(pluginLoader, "ensureRepoClone")
    buildPluginSpy = vi.spyOn(pluginLoader, "buildPlugin")
    loadPluginFromRepoSpy = vi.spyOn(pluginLoader, "loadPluginFromRepo")
  })

  it("should check npm, install update, clone repo, build, and load from repo", async () => {
    // Use vi.spyOn on the real node:child_process module to intercept execFileSync
    // This preserves spawnSync and other exports needed by transitive deps.
    const cp = await import("node:child_process")
    const execSpy = vi.spyOn(cp, "execFileSync").mockImplementation(() => "" as any)

    checkNpmRegistrySpy!.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    ensureRepoCloneSpy!.mockReturnValue("/home/user/.local/share/flowdeck")
    buildPluginSpy!.mockImplementation(() => {})
    loadPluginFromRepoSpy!.mockResolvedValue(vi.fn().mockResolvedValue({ name: "repo-plugin" }) as any)

    const { default: plugin } = await import("../../src/index")

    const result = await plugin({ directory: "/tmp/test" } as any)

    expect(checkNpmRegistrySpy).toHaveBeenCalledOnce()
    expect(execSpy).toHaveBeenCalledWith(
      "npm",
      ["install", "--ignore-scripts", "@dv.nghiem/flowdeck@latest"],
      expect.objectContaining({ timeout: 60_000 }),
    )
    expect(ensureRepoCloneSpy).toHaveBeenCalledOnce()
    expect(buildPluginSpy).toHaveBeenCalledWith("/home/user/.local/share/flowdeck")
    expect(loadPluginFromRepoSpy).toHaveBeenCalledWith("/home/user/.local/share/flowdeck")

    expect(result).toEqual({ name: "repo-plugin" })

    execSpy.mockRestore()
  })

  it("should skip npm install when no update available", async () => {
    const cp = await import("node:child_process")
    const execSpy = vi.spyOn(cp, "execFileSync").mockImplementation(() => "" as any)

    checkNpmRegistrySpy!.mockResolvedValue({
      updateAvailable: false,
      latest: "0.6.0",
      current: "0.6.0",
    })
    ensureRepoCloneSpy!.mockReturnValue("/home/user/.local/share/flowdeck")
    loadPluginFromRepoSpy!.mockResolvedValue(vi.fn() as any)

    const { default: plugin } = await import("../../src/index")
    await plugin({ directory: "/tmp/test" } as any)

    expect(checkNpmRegistrySpy).toHaveBeenCalledOnce()
    const npmCalls = execSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === "npm",
    )
    expect(npmCalls).toHaveLength(0)

    execSpy.mockRestore()
  })

  it("should fall back to bundled plugin when repo load fails", async () => {
    checkNpmRegistrySpy!.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    ensureRepoCloneSpy!.mockReturnValue("/home/user/.local/share/flowdeck")
    buildPluginSpy!.mockImplementation(() => {})
    // repo load returns null — triggers fallback to bundled plugin
    loadPluginFromRepoSpy!.mockResolvedValue(null)

    const { default: plugin } = await import("../../src/index")
    const result = await plugin({ directory: "/tmp/test" } as any)

    // Fallback loaded the real src/plugin/index.ts which returns the full plugin
    expect(result).toBeDefined()
    expect(result).toHaveProperty("name", "@dv.nghiem/flowdeck")
    expect(result).toHaveProperty("tool")
    const toolNames = Object.keys((result as any).tool ?? {})
    expect(toolNames).toContain("planning-state")
    expect(toolNames).toContain("fdx-read")
    expect(toolNames).toContain("codegraph")
  })

  it("should fall back when all update steps fail", async () => {
    // All update steps fail (checkNpmRegistry rejects)
    checkNpmRegistrySpy!.mockRejectedValue(new Error("Network error"))
    loadPluginFromRepoSpy!.mockResolvedValue(null)

    const { default: plugin } = await import("../../src/index")
    const result = await plugin({ directory: "/tmp/test" } as any)

    // Fallback to real bundled plugin
    expect(result).toBeDefined()
    expect(result).toHaveProperty("name", "@dv.nghiem/flowdeck")
    expect(result).toHaveProperty("tool")
    const toolNames = Object.keys((result as any).tool ?? {})
    expect(toolNames).toContain("planning-state")
    expect(toolNames).toContain("fdx-read")
    expect(toolNames).toContain("codegraph")
  })

  it("should not emit [flowdeck-loader] console.warn when FLOWDECK_DEBUG is not set and update fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    // All update steps fail
    checkNpmRegistrySpy!.mockRejectedValue(new Error("Network error"))
    loadPluginFromRepoSpy!.mockResolvedValue(null)

    const { default: plugin } = await import("../../src/index")
    await plugin({ directory: "/tmp/test" } as any)

    // No [flowdeck-loader] prefixed console.warn should be emitted
    const flowdeckWarns = warnSpy.mock.calls.filter(
      (c: unknown[]) => String(c[0] ?? "") === "[flowdeck-loader]",
    )
    expect(flowdeckWarns).toHaveLength(0)

    warnSpy.mockRestore()
  })

  it("should emit [flowdeck-loader] console.warn when FLOWDECK_DEBUG is set and update fails", async () => {
    process.env.FLOWDECK_DEBUG = "1"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    checkNpmRegistrySpy!.mockRejectedValue(new Error("Network error"))
    loadPluginFromRepoSpy!.mockResolvedValue(null)

    const { default: plugin } = await import("../../src/index")
    await plugin({ directory: "/tmp/test" } as any)

    const flowdeckWarns = warnSpy.mock.calls.filter(
      (c: unknown[]) => String(c[0] ?? "") === "[flowdeck-loader]",
    )
    expect(flowdeckWarns.length).toBeGreaterThan(0)

    delete process.env.FLOWDECK_DEBUG
    warnSpy.mockRestore()
  })

  it("should pass --ignore-scripts to npm install", async () => {
    const cp = await import("node:child_process")
    const execSpy = vi.spyOn(cp, "execFileSync").mockImplementation(() => "" as any)

    checkNpmRegistrySpy!.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    ensureRepoCloneSpy!.mockReturnValue("/home/user/.local/share/flowdeck")
    buildPluginSpy!.mockImplementation(() => {})
    loadPluginFromRepoSpy!.mockResolvedValue(vi.fn() as any)

    const { default: plugin } = await import("../../src/index")
    await plugin({ directory: "/tmp/test" } as any)

    const npmCalls = execSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === "npm",
    )
    expect(npmCalls.length).toBeGreaterThanOrEqual(1)
    const args = npmCalls[0][1] as string[]
    expect(args).toContain("--ignore-scripts")

    execSpy.mockRestore()
  })
})
