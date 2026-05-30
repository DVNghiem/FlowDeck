import { describe, it, expect, spyOn, afterEach } from "bun:test"
import * as childProcess from "child_process"
import * as fs from "fs"
import { detectRtk, wrapCommandArgs, getRtkStatus } from "@/services/rtk-manager"
import { shouldWrapWithRtk } from "@/services/rtk-policy"

// ─── detectRtk ────────────────────────────────────────────────────────────────

describe("detectRtk", () => {
  afterEach(() => {
    // Restore spies
  })

  it("returns installed=true when rtk is in PATH", () => {
    const spy = spyOn(childProcess, "spawnSync").mockReturnValueOnce({
      status: 0,
      stdout: "rtk 0.1.0\n",
      stderr: "",
      pid: 1,
      output: [],
      signal: null,
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>)

    const result = detectRtk()
    expect(result.installed).toBe(true)
    expect(result.version).toBe("rtk 0.1.0")
    spy.mockRestore()
  })

  it("returns installed=false when rtk is not found anywhere", () => {
    const spawnSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "not found",
      pid: 0,
      output: [],
      signal: null,
      error: undefined,
    } as unknown as ReturnType<typeof childProcess.spawnSync>)

    const existsSpy = spyOn(fs, "existsSync").mockReturnValue(false)

    const result = detectRtk()
    expect(result.installed).toBe(false)
    expect(result.error).toContain("not found")

    spawnSpy.mockRestore()
    existsSpy.mockRestore()
  })

  it("finds rtk at known install location when not in PATH", () => {
    let callCount = 0
    // Cast to bypass overload union incompatibility in mock return type
    const spawnSpy = spyOn(childProcess, "spawnSync") as unknown as { mockImplementation: (fn: (...a: unknown[]) => unknown) => void; mockRestore: () => void }
    spawnSpy.mockImplementation((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) {
        return { status: 1, stdout: "", stderr: "", pid: 0, output: [], signal: null }
      }
      return { status: 0, stdout: "rtk 0.2.0\n", stderr: "", pid: 1, output: [], signal: null }
    })

    const existsSpy = spyOn(fs, "existsSync").mockReturnValue(true)

    const result = detectRtk()
    expect(result.installed).toBe(true)
    expect(result.version).toBe("rtk 0.2.0")

    spawnSpy.mockRestore()
    existsSpy.mockRestore()
  })
})

// ─── wrapCommandArgs ──────────────────────────────────────────────────────────

describe("wrapCommandArgs", () => {
  it("wraps supported commands when binPath is provided", () => {
    const result = wrapCommandArgs("git", ["status"], "/usr/local/bin/rtk")
    expect(result).toEqual(["/usr/local/bin/rtk", "git", "status"])
  })

  it("does not wrap when binPath is undefined", () => {
    const result = wrapCommandArgs("git", ["status"], undefined)
    expect(result).toEqual(["git", "status"])
  })

  it("does not wrap unsupported commands even when binPath is provided", () => {
    const result = wrapCommandArgs("codegraph", ["index"], "/usr/local/bin/rtk")
    expect(result).toEqual(["codegraph", "index"])
  })

  it("does not wrap compact git subcommands", () => {
    const result = wrapCommandArgs("git", ["rev-parse", "--short", "HEAD"], "/usr/local/bin/rtk")
    expect(result).toEqual(["git", "rev-parse", "--short", "HEAD"])
  })

  it("does not wrap git diff --name-only", () => {
    const result = wrapCommandArgs("git", ["diff", "--name-only"], "/usr/local/bin/rtk")
    expect(result).toEqual(["git", "diff", "--name-only"])
  })

  it("handles empty args array", () => {
    const result = wrapCommandArgs("git", [], "/usr/local/bin/rtk")
    // git with no args — not in compact list, so should wrap
    expect(result).toEqual(["/usr/local/bin/rtk", "git"])
  })

  it("preserves all args when wrapping", () => {
    const args = ["log", "--oneline", "-20", "--graph"]
    const result = wrapCommandArgs("git", args, "rtk")
    expect(result).toEqual(["rtk", "git", "log", "--oneline", "-20", "--graph"])
  })
})

// ─── getRtkStatus ─────────────────────────────────────────────────────────────

describe("getRtkStatus", () => {
  it("returns installed=false with install instructions when rtk not found", () => {
    const spawnSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 1, stdout: "", stderr: "", pid: 0, output: [], signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>)
    const existsSpy = spyOn(fs, "existsSync").mockReturnValue(false)

    const status = getRtkStatus()
    expect(status.installed).toBe(false)
    expect(status.initAttempted).toBe(false)
    expect(status.telemetryDisabled).toBe(false)
    expect(status.installInstructions).toContain("curl")
    expect(status.installInstructions).toContain("install.sh")

    spawnSpy.mockRestore()
    existsSpy.mockRestore()
  })

  it("returns installed=true without running init by default", () => {
    const spawnSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 0, stdout: "rtk 0.1.0\n", stderr: "", pid: 1, output: [], signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>)

    const status = getRtkStatus()
    expect(status.installed).toBe(true)
    expect(status.initAttempted).toBe(false)
    expect(status.initSuccess).toBe(false)
    expect(status.telemetryDisabled).toBe(false)

    spawnSpy.mockRestore()
  })

  it("runs init when runInit=true and rtk is installed", () => {
    let callCount = 0
    const spawnSpy = spyOn(childProcess, "spawnSync") as unknown as { mockImplementation: (fn: (...a: unknown[]) => unknown) => void; mockRestore: () => void }
    spawnSpy.mockImplementation((..._args: unknown[]) => {
      callCount++
      // call 1: detectRtk --version (success)
      // call 2: init -g (success)
      // call 3: telemetry disable (success)
      return { status: 0, stdout: callCount === 1 ? "rtk 0.1.0\n" : "ok\n", stderr: "", pid: 1, output: [], signal: null }
    })

    const status = getRtkStatus({ runInit: true })
    expect(status.installed).toBe(true)
    expect(status.initAttempted).toBe(true)
    expect(status.initSuccess).toBe(true)
    expect(status.telemetryDisabled).toBe(true)

    spawnSpy.mockRestore()
  })

  it("reports telemetryDisabled=false when telemetry disable step fails", () => {
    let callCount = 0
    const spawnSpy = spyOn(childProcess, "spawnSync") as unknown as { mockImplementation: (fn: (...a: unknown[]) => unknown) => void; mockRestore: () => void }
    spawnSpy.mockImplementation((..._args: unknown[]) => {
      callCount++
      // call 1: detectRtk --version (success)
      // call 2: init -g (success)
      // call 3: telemetry disable (fails)
      if (callCount === 3) {
        return { status: 1, stdout: "", stderr: "error", pid: 0, output: [], signal: null }
      }
      return { status: 0, stdout: callCount === 1 ? "rtk 0.1.0\n" : "ok\n", stderr: "", pid: 1, output: [], signal: null }
    })

    const status = getRtkStatus({ runInit: true })
    expect(status.initSuccess).toBe(true)
    expect(status.telemetryDisabled).toBe(false)

    spawnSpy.mockRestore()
  })

  it("does not attempt init when rtk is not installed", () => {
    const spawnSpy = spyOn(childProcess, "spawnSync").mockReturnValue({
      status: 1, stdout: "", stderr: "", pid: 0, output: [], signal: null,
    } as unknown as ReturnType<typeof childProcess.spawnSync>)
    const existsSpy = spyOn(fs, "existsSync").mockReturnValue(false)

    const status = getRtkStatus({ runInit: true })
    expect(status.installed).toBe(false)
    expect(status.initAttempted).toBe(false)

    spawnSpy.mockRestore()
    existsSpy.mockRestore()
  })
})

// ─── integration: policy + wrapping coherence ─────────────────────────────────

describe("rtk wrapping coherence", () => {
  it("wrapCommandArgs respects shouldWrapWithRtk for all policy decisions", () => {
    const binPath = "/usr/local/bin/rtk"
    const cases: Array<[string, string[], boolean]> = [
      ["git", ["status"], true],
      ["git", ["rev-parse", "--short", "HEAD"], false],
      ["npm", ["test"], true],
      ["codegraph", ["index"], false],
      ["curl", ["-fsSL", "http://x.com"], false],
      ["tsc", ["--noEmit"], true],
    ]

    for (const [cmd, args, shouldWrap] of cases) {
      const wrapped = wrapCommandArgs(cmd, args, binPath)
      if (shouldWrap) {
        expect(wrapped[0]).toBe(binPath)
        expect(wrapped[1]).toBe(cmd)
      } else {
        expect(wrapped[0]).toBe(cmd)
      }
    }
  })
})
