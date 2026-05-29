import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { shouldWrapWithRtk, getSupportedCommands } from "./rtk-policy"

// ─── shouldWrapWithRtk ────────────────────────────────────────────────────────

describe("shouldWrapWithRtk", () => {
  // Supported commands that produce noisy output
  it("wraps git status", () => {
    expect(shouldWrapWithRtk("git", ["status"])).toBe(true)
  })

  it("wraps git log", () => {
    expect(shouldWrapWithRtk("git", ["log", "--oneline", "-10"])).toBe(true)
  })

  it("wraps git diff without flags", () => {
    expect(shouldWrapWithRtk("git", ["diff"])).toBe(true)
  })

  it("wraps git show", () => {
    expect(shouldWrapWithRtk("git", ["show", "HEAD"])).toBe(true)
  })

  it("wraps npm test", () => {
    expect(shouldWrapWithRtk("npm", ["test"])).toBe(true)
  })

  it("wraps bun test", () => {
    expect(shouldWrapWithRtk("bun", ["test"])).toBe(true)
  })

  it("wraps tsc", () => {
    expect(shouldWrapWithRtk("tsc", ["--noEmit"])).toBe(true)
  })

  it("wraps eslint", () => {
    expect(shouldWrapWithRtk("eslint", ["src/"])).toBe(true)
  })

  it("wraps docker", () => {
    expect(shouldWrapWithRtk("docker", ["ps"])).toBe(true)
  })

  it("wraps kubectl", () => {
    expect(shouldWrapWithRtk("kubectl", ["get", "pods"])).toBe(true)
  })

  it("wraps cargo test", () => {
    expect(shouldWrapWithRtk("cargo", ["test"])).toBe(true)
  })

  it("wraps gh", () => {
    expect(shouldWrapWithRtk("gh", ["pr", "list"])).toBe(true)
  })

  // Compact git subcommands — should NOT be wrapped
  it("does not wrap git rev-parse", () => {
    expect(shouldWrapWithRtk("git", ["rev-parse", "--short", "HEAD"])).toBe(false)
  })

  it("does not wrap git diff --name-only", () => {
    expect(shouldWrapWithRtk("git", ["diff", "--name-only", "HEAD~1"])).toBe(false)
  })

  it("does not wrap git diff --name-status", () => {
    expect(shouldWrapWithRtk("git", ["diff", "--name-status"])).toBe(false)
  })

  it("does not wrap git diff --stat", () => {
    expect(shouldWrapWithRtk("git", ["diff", "--stat"])).toBe(false)
  })

  it("does not wrap git ls-files", () => {
    expect(shouldWrapWithRtk("git", ["ls-files"])).toBe(false)
  })

  it("does not wrap git config", () => {
    expect(shouldWrapWithRtk("git", ["config", "--get", "user.email"])).toBe(false)
  })

  // Never-wrap commands
  it("does not wrap codegraph", () => {
    expect(shouldWrapWithRtk("codegraph", ["index", "--force"])).toBe(false)
  })

  it("does not wrap curl", () => {
    expect(shouldWrapWithRtk("curl", ["-fsSL", "https://example.com"])).toBe(false)
  })

  it("does not wrap sh", () => {
    expect(shouldWrapWithRtk("sh", ["-c", "echo hello"])).toBe(false)
  })

  it("does not wrap bash", () => {
    expect(shouldWrapWithRtk("bash", ["-c", "ls"])).toBe(false)
  })

  it("does not wrap node", () => {
    expect(shouldWrapWithRtk("node", ["script.js"])).toBe(false)
  })

  it("does not wrap python", () => {
    expect(shouldWrapWithRtk("python", ["setup.py"])).toBe(false)
  })

  // Unknown commands
  it("does not wrap unknown commands", () => {
    expect(shouldWrapWithRtk("ffmpeg", ["-i", "in.mp4"])).toBe(false)
    expect(shouldWrapWithRtk("aws", ["s3", "ls"])).toBe(false)
  })

  // Case normalization
  it("is case-insensitive for command name", () => {
    expect(shouldWrapWithRtk("GIT", ["status"])).toBe(true)
    expect(shouldWrapWithRtk("NPM", ["test"])).toBe(true)
  })
})

// ─── getSupportedCommands ─────────────────────────────────────────────────────

describe("getSupportedCommands", () => {
  it("returns sorted list", () => {
    const cmds = getSupportedCommands()
    expect(cmds).toEqual([...cmds].sort())
  })

  it("includes key commands", () => {
    const cmds = getSupportedCommands()
    expect(cmds).toContain("git")
    expect(cmds).toContain("npm")
    expect(cmds).toContain("docker")
    expect(cmds).toContain("tsc")
  })

  it("excludes never-wrap commands", () => {
    const cmds = getSupportedCommands()
    expect(cmds).not.toContain("codegraph")
    expect(cmds).not.toContain("curl")
    expect(cmds).not.toContain("sh")
  })
})
