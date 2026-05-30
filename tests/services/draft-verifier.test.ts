/**
 * Draft Verifier Tests
 *
 * Covers:
 * - verifyDraft: all verifiers pass → accepted: true
 * - verifyDraft: one failure → accepted: false
 * - min_length: passes when length >= min, fails when below
 * - is_json: passes for valid JSON, fails for invalid
 * - contains_key: passes when key found, fails when missing
 * - matches_regex: passes when regex matches, fails when not
 * - is_nonempty: passes for non-empty, fails for empty/whitespace
 * - no_error_markers: passes clean text, fails error-containing text
 * - defaultVerifiers: returns appropriate verifiers for each task type
 */
import { describe, it, expect } from "vitest"
import { verifyDraft, defaultVerifiers } from "@/services/draft-verifier"

describe("verifyDraft", () => {
  it("accepts when all verifiers pass", () => {
    const decision = verifyDraft("This is a complete answer with enough content.", [
      { type: "is_nonempty" },
      { type: "min_length", min_chars: 10 },
      { type: "no_error_markers" },
    ])
    expect(decision.accepted).toBe(true)
    expect(decision.failures).toBe(0)
  })

  it("rejects when one verifier fails", () => {
    const decision = verifyDraft("short", [
      { type: "is_nonempty" },
      { type: "min_length", min_chars: 100 },
    ])
    expect(decision.accepted).toBe(false)
    expect(decision.failures).toBe(1)
  })

  it("returns results for all verifiers", () => {
    const decision = verifyDraft("hello", [
      { type: "is_nonempty" },
      { type: "min_length", min_chars: 100 },
    ])
    expect(decision.verifications).toHaveLength(2)
    expect(decision.verifications[0].passed).toBe(true)
    expect(decision.verifications[1].passed).toBe(false)
  })

  it("accepts empty verifier list", () => {
    const decision = verifyDraft("anything", [])
    expect(decision.accepted).toBe(true)
    expect(decision.failures).toBe(0)
  })
})

describe("min_length verifier", () => {
  it("passes when length >= min_chars", () => {
    const d = verifyDraft("hello", [{ type: "min_length", min_chars: 5 }])
    expect(d.accepted).toBe(true)
  })

  it("fails when length < min_chars", () => {
    const d = verifyDraft("hi", [{ type: "min_length", min_chars: 5 }])
    expect(d.accepted).toBe(false)
    expect(d.verifications[0].reason).toContain("< 5")
  })

  it("defaults to min_chars: 1 when not specified", () => {
    expect(verifyDraft("x", [{ type: "min_length" }]).accepted).toBe(true)
    expect(verifyDraft("", [{ type: "min_length" }]).accepted).toBe(false)
  })
})

describe("is_json verifier", () => {
  it("passes for valid JSON object", () => {
    expect(verifyDraft('{"key": "val"}', [{ type: "is_json" }]).accepted).toBe(true)
  })

  it("passes for valid JSON array", () => {
    expect(verifyDraft("[1, 2, 3]", [{ type: "is_json" }]).accepted).toBe(true)
  })

  it("fails for invalid JSON", () => {
    const d = verifyDraft("{bad json}", [{ type: "is_json" }])
    expect(d.accepted).toBe(false)
    expect(d.verifications[0].reason).toContain("invalid JSON")
  })
})

describe("contains_key verifier", () => {
  it("passes when key is present", () => {
    expect(
      verifyDraft("The result is SUCCESS here", [{ type: "contains_key", required_key: "SUCCESS" }]).accepted,
    ).toBe(true)
  })

  it("fails when key is absent", () => {
    const d = verifyDraft("no special word", [{ type: "contains_key", required_key: "SUCCESS" }])
    expect(d.accepted).toBe(false)
    expect(d.verifications[0].reason).toContain('missing key "SUCCESS"')
  })

  it("fails when required_key is empty string", () => {
    const d = verifyDraft("anything", [{ type: "contains_key", required_key: "" }])
    expect(d.accepted).toBe(false)
  })
})

describe("matches_regex verifier", () => {
  it("passes when pattern matches", () => {
    expect(
      verifyDraft("version 1.2.3", [{ type: "matches_regex", pattern: "\\d+\\.\\d+\\.\\d+" }]).accepted,
    ).toBe(true)
  })

  it("fails when pattern does not match", () => {
    const d = verifyDraft("no version here", [{ type: "matches_regex", pattern: "\\d+\\.\\d+\\.\\d+" }])
    expect(d.accepted).toBe(false)
  })

  it("fails gracefully on invalid regex", () => {
    const d = verifyDraft("anything", [{ type: "matches_regex", pattern: "[invalid" }])
    expect(d.accepted).toBe(false)
    expect(d.verifications[0].reason).toContain("invalid regex pattern")
  })
})

describe("is_nonempty verifier", () => {
  it("passes for non-empty string", () => {
    expect(verifyDraft("hello", [{ type: "is_nonempty" }]).accepted).toBe(true)
  })

  it("fails for empty string", () => {
    expect(verifyDraft("", [{ type: "is_nonempty" }]).accepted).toBe(false)
  })

  it("fails for whitespace-only string", () => {
    expect(verifyDraft("   \n\t  ", [{ type: "is_nonempty" }]).accepted).toBe(false)
  })
})

describe("no_error_markers verifier", () => {
  it("passes for clean response", () => {
    expect(verifyDraft("Everything looks good!", [{ type: "no_error_markers" }]).accepted).toBe(true)
  })

  it("fails when response contains 'error:'", () => {
    const d = verifyDraft("error: file not found", [{ type: "no_error_markers" }])
    expect(d.accepted).toBe(false)
    expect(d.verifications[0].reason).toContain("error:")
  })

  it("fails when response contains 'i cannot'", () => {
    const d = verifyDraft("I cannot help with that.", [{ type: "no_error_markers" }])
    expect(d.accepted).toBe(false)
  })

  it("is case-insensitive", () => {
    const d = verifyDraft("ERROR: something went wrong", [{ type: "no_error_markers" }])
    expect(d.accepted).toBe(false)
  })
})

describe("defaultVerifiers", () => {
  it("json_response requires nonempty + valid JSON + no error markers", () => {
    const verifiers = defaultVerifiers("json_response")
    expect(verifiers.map(v => v.type)).toContain("is_nonempty")
    expect(verifiers.map(v => v.type)).toContain("is_json")
    expect(verifiers.map(v => v.type)).toContain("no_error_markers")
  })

  it("classification requires min length + no error markers", () => {
    const verifiers = defaultVerifiers("classification")
    expect(verifiers.map(v => v.type)).toContain("min_length")
    expect(verifiers.map(v => v.type)).toContain("no_error_markers")
  })

  it("prose_response requires min 50 chars", () => {
    const verifiers = defaultVerifiers("prose_response")
    const minLen = verifiers.find(v => v.type === "min_length")
    expect(minLen?.min_chars).toBe(50)
  })

  it("json_response verifiers reject invalid JSON draft", () => {
    const verifiers = defaultVerifiers("json_response")
    expect(verifyDraft("{bad}", verifiers).accepted).toBe(false)
  })

  it("json_response verifiers accept valid JSON draft", () => {
    const verifiers = defaultVerifiers("json_response")
    expect(verifyDraft('{"status": "ok"}', verifiers).accepted).toBe(true)
  })
})
