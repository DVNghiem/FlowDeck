/**
 * Artifact Store Tests
 *
 * Covers:
 * - contentHash: deterministic, 24-char hex
 * - summarizeContent: short content unchanged, long content truncated
 * - storeArtifact: writes file, returns ref with id + summary
 * - getArtifact: returns artifact when versions match
 * - getArtifact: returns null on version mismatch (stale)
 * - getArtifact: returns null for missing id
 * - resolveArtifactRefs: replaces artifact tokens with content
 * - resolveArtifactRefs: leaves non-existent artifacts as placeholder
 * - formatArtifactRef: correct format
 */
import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  contentHash,
  summarizeContent,
  storeArtifact,
  getArtifact,
  resolveArtifactRefs,
  formatArtifactRef,
  ARTIFACT_SUMMARY_MAX_CHARS,
} from "@/services/artifact-store"

let tempDir: string

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), "artifact-store-test-"))
  return tempDir
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ""
  }
})

describe("contentHash", () => {
  it("returns a 24-char hex string", () => {
    const hash = contentHash("hello world")
    expect(hash).toMatch(/^[a-f0-9]{24}$/)
  })

  it("is deterministic", () => {
    expect(contentHash("same content")).toBe(contentHash("same content"))
  })

  it("differs for different content", () => {
    expect(contentHash("content A")).not.toBe(contentHash("content B"))
  })

  it("trims whitespace before hashing", () => {
    expect(contentHash("  hello  ")).toBe(contentHash("hello"))
  })
})

describe("summarizeContent", () => {
  it("returns content unchanged when short", () => {
    const short = "Short content"
    expect(summarizeContent(short)).toBe(short)
  })

  it("truncates content to ARTIFACT_SUMMARY_MAX_CHARS with ellipsis", () => {
    const long = "x".repeat(ARTIFACT_SUMMARY_MAX_CHARS + 100)
    const summary = summarizeContent(long)
    expect(summary.length).toBeLessThanOrEqual(ARTIFACT_SUMMARY_MAX_CHARS)
    expect(summary.endsWith("...")).toBe(true)
  })

  it("collapses whitespace", () => {
    const summary = summarizeContent("hello\n\n\nworld")
    expect(summary).toBe("hello world")
  })
})

describe("storeArtifact and getArtifact", () => {
  it("stores and retrieves an artifact", () => {
    const dir = makeTempDir()
    const ref = storeArtifact(dir, "reviewer", "verify", "my output", 1, 2)
    expect(ref.id).toMatch(/^[a-f0-9]{24}$/)
    expect(ref.summary).toContain("my output")

    const artifact = getArtifact(dir, ref.id, 1, 2)
    expect(artifact).not.toBeNull()
    expect(artifact!.content).toBe("my output")
    expect(artifact!.agent).toBe("reviewer")
    expect(artifact!.stage).toBe("verify")
  })

  it("returns null when stateVersion doesn't match", () => {
    const dir = makeTempDir()
    const ref = storeArtifact(dir, "reviewer", "verify", "content", 1, 2)
    const artifact = getArtifact(dir, ref.id, 999, 2)
    expect(artifact).toBeNull()
  })

  it("returns null when indexVersion doesn't match", () => {
    const dir = makeTempDir()
    const ref = storeArtifact(dir, "reviewer", "verify", "content", 1, 2)
    const artifact = getArtifact(dir, ref.id, 1, 999)
    expect(artifact).toBeNull()
  })

  it("returns null for missing id", () => {
    const dir = makeTempDir()
    const artifact = getArtifact(dir, "aabbccddeeff001122334455", 1, 1)
    expect(artifact).toBeNull()
  })

  it("same content produces same id (content-addressed)", () => {
    const dir = makeTempDir()
    const ref1 = storeArtifact(dir, "agent1", "stage1", "same content", 1, 1)
    const ref2 = storeArtifact(dir, "agent2", "stage2", "same content", 1, 1)
    expect(ref1.id).toBe(ref2.id)
  })
})

describe("resolveArtifactRefs", () => {
  it("replaces artifact token with content", () => {
    const dir = makeTempDir()
    const ref = storeArtifact(dir, "coder", "execute", "function foo() {}", 1, 1)
    const text = `Here is the code: artifact:${ref.id}`
    const resolved = resolveArtifactRefs(dir, text, 1, 1)
    expect(resolved).toContain("function foo() {}")
    expect(resolved).not.toContain(`artifact:${ref.id}`)
  })

  it("leaves non-existent artifacts as placeholder", () => {
    const dir = makeTempDir()
    const fakeId = "aabbccddeeff001122334455"
    const text = `Missing: artifact:${fakeId}`
    const resolved = resolveArtifactRefs(dir, text, 1, 1)
    expect(resolved).toContain(`[artifact:${fakeId} not found]`)
  })

  it("leaves stale artifacts as placeholder", () => {
    const dir = makeTempDir()
    const ref = storeArtifact(dir, "agent", "stage", "stale content", 1, 1)
    const text = `artifact:${ref.id}`
    const resolved = resolveArtifactRefs(dir, text, 999, 1)
    expect(resolved).toContain("[artifact:")
    expect(resolved).toContain("not found")
  })

  it("returns text unchanged when no artifact tokens present", () => {
    const dir = makeTempDir()
    const text = "no artifacts here"
    expect(resolveArtifactRefs(dir, text, 1, 1)).toBe(text)
  })
})

describe("formatArtifactRef", () => {
  it("includes id and summary", () => {
    const formatted = formatArtifactRef({ id: "abc123", summary: "my summary" })
    expect(formatted).toContain("artifact:abc123")
    expect(formatted).toContain("my summary")
  })
})
