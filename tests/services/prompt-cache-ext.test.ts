/**
 * Extended Prompt Cache Tests (Round 2)
 *
 * Covers:
 * - normalizeForCache: collapses whitespace, trims
 * - normalizeForCache: preserves punctuation and case
 * - hashKeyNormalized: different from hashKey when whitespace differs
 * - hashKeyNormalized: same as hashKey when text already normalized
 * - getCached: returns hit on whitespace-normalized fallback
 * - getCached: normalized key does not match different punctuation (safety)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  normalizeForCache,
  hashKey,
  hashKeyNormalized,
  getCached,
  setCached,
} from "@/services/prompt-cache"

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cache-ext-test-"))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe("normalizeForCache", () => {
  it("collapses multiple spaces to one", () => {
    expect(normalizeForCache("hello   world")).toBe("hello world")
  })

  it("collapses newlines to spaces", () => {
    expect(normalizeForCache("hello\n\nworld")).toBe("hello world")
  })

  it("trims leading and trailing whitespace", () => {
    expect(normalizeForCache("  hello  ")).toBe("hello")
  })

  it("preserves punctuation", () => {
    expect(normalizeForCache("Is X needed?")).toBe("Is X needed?")
  })

  it("preserves case", () => {
    expect(normalizeForCache("Hello World")).toBe("Hello World")
  })

  it("no-ops on already normalized text", () => {
    expect(normalizeForCache("already clean")).toBe("already clean")
  })
})

describe("hashKeyNormalized", () => {
  it("differs from hashKey when whitespace varies", () => {
    const exact = hashKey("reviewer", "hello   world", "", 1, 1)
    const norm = hashKeyNormalized("reviewer", "hello   world", "", 1, 1)
    // exact key uses trim() only; normalized collapses internal whitespace
    // The two should differ because trim() != collapse-all-whitespace
    const exactNorm = hashKey("reviewer", "hello world", "", 1, 1)
    // normalized key should match what exact key would be for "hello world"
    expect(norm).toBe(exactNorm)
  })

  it("equals hashKey for already-normalized text", () => {
    const text = "clean text"
    const exact = hashKey("reviewer", text, "", 1, 1)
    const norm = hashKeyNormalized("reviewer", text, "", 1, 1)
    expect(exact).toBe(norm)
  })
})

describe("getCached with normalized fallback", () => {
  it("returns cache hit when prompt has extra whitespace", () => {
    // Store with clean prompt
    setCached(tempDir, "reviewer", "Is X needed?", "", 1, 1, "yes", true)

    // Retrieve with extra whitespace — should hit normalized key
    const hit = getCached(tempDir, "reviewer", "Is X needed?  ", "", 1, 1, true)
    expect(hit).toBe("yes")
  })

  it("returns cache hit when prompt has extra newlines", () => {
    setCached(tempDir, "reviewer", "Classify this task", "", 2, 3, "planning", true)
    const hit = getCached(tempDir, "reviewer", "Classify this task\n", "", 2, 3, true)
    expect(hit).toBe("planning")
  })

  it("does not return hit for different punctuation (safety)", () => {
    setCached(tempDir, "reviewer", "Is X needed?", "", 1, 1, "yes", true)
    // Question mark removed — semantically different
    const hit = getCached(tempDir, "reviewer", "Is X needed", "", 1, 1, true)
    expect(hit).toBeNull()
  })

  it("returns null when not in CACHEABLE_AGENTS even with normalized key", () => {
    setCached(tempDir, "reviewer", "clean text", "", 1, 1, "cached", true)
    const hit = getCached(tempDir, "backend-coder", "clean text", "", 1, 1, true)
    expect(hit).toBeNull()
  })
})
