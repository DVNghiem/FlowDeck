import { describe, it, expect } from "vitest"
import { applyChatMessageGuidance, extractFirstText } from "../../src/lib/orchestrator-guidance"

const detectMock = async (text: string) => {
  // Match the real detectIntent() return shape so we exercise the full flow.
  const bugfixHits = (text.match(/\b(fix|bug|error|broken|crash|fails|failing)\b/gi) ?? []).length
  const featureHits = (text.match(/\b(add|implement|build|create|introduce)\b/gi) ?? []).length
  if (bugfixHits > 0) {
    return { intent: "bugfix" as const, confidence: Math.min(1, bugfixHits * 0.4) }
  }
  if (featureHits > 0) {
    return { intent: "ui-heavy" as const, confidence: Math.min(1, featureHits * 0.4) }
  }
  return { intent: "unknown" as const, confidence: 0 }
}

describe("extractFirstText", () => {
  it("returns empty string for non-array content", () => {
    expect(extractFirstText(undefined)).toBe("")
    expect(extractFirstText(null)).toBe("")
    expect(extractFirstText("string")).toBe("")
  })

  it("returns empty string when no TextPart", () => {
    expect(extractFirstText([{ type: "file" }])).toBe("")
    expect(extractFirstText([])).toBe("")
  })

  it("returns text from first TextPart", () => {
    expect(extractFirstText([{ type: "text", text: "hello" }])).toBe("hello")
  })

  it("skips non-text parts to find first TextPart", () => {
    expect(
      extractFirstText([{ type: "file" }, { type: "text", text: "world" }])
    ).toBe("world")
  })
})

describe("applyChatMessageGuidance", () => {
  it("skips when role is not user", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "assistant", content: [{ type: "text", text: "fix bug" }] },
      detectMock
    )
    expect(parts).toEqual([])
  })

  it("skips when no content", async () => {
    const parts = await applyChatMessageGuidance({ role: "user" }, detectMock)
    expect(parts).toEqual([])
  })

  it("skips when text is empty", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "" }] },
      detectMock
    )
    expect(parts).toEqual([])
  })

  it("skips when text starts with / (command)", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "/fd-task add auth" }] },
      detectMock
    )
    expect(parts).toEqual([])
  })

  it("skips when no TextPart is present", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "file" }] },
      detectMock
    )
    expect(parts).toEqual([])
  })

  it("skips when detectIntent returns low confidence", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "hello world" }] },
      detectMock
    )
    expect(parts).toEqual([])
  })

  it("injects synthetic TextPart when intent matches with high confidence", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "fix bug error broken" }] },
      detectMock
    )
    expect(parts.length).toBeGreaterThan(0)
    expect(parts[0].type).toBe("text")
    expect(parts[0].synthetic).toBe(true)
    expect(parts[0].text).toContain("/fd-task")
  })

  it("uses the first TextPart when multiple parts are present", async () => {
    const parts = await applyChatMessageGuidance(
      {
        role: "user",
        content: [
          { type: "text", text: "fix bug error broken" },
          { type: "text", text: "ignored" },
        ],
      },
      detectMock
    )
    expect(parts.length).toBeGreaterThan(0)
    // extractTopic strips the leading "fix" verb, so guidance echoes "bug error broken"
    expect(parts[0].text).toContain("bug error broken")
    expect(parts[0].text).not.toContain("ignored")
  })

  it("injects default guidance when detectIntent throws", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "anything" }] },
      async () => {
        throw new Error("intentional failure")
      }
    )
    expect(parts.length).toBe(1)
    expect(parts[0].text).toContain("your task description")
    expect(parts[0].synthetic).toBe(true)
  })

  it("returns parts with valid uuid ids", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "fix crash" }] },
      detectMock
    )
    expect(parts[0].id).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it("returns parts with empty sessionID and messageID (hook context fills in)", async () => {
    const parts = await applyChatMessageGuidance(
      { role: "user", content: [{ type: "text", text: "fix crash" }] },
      detectMock
    )
    expect(parts[0].sessionID).toBe("")
    expect(parts[0].messageID).toBe("")
  })
})
