import { describe, it, expect } from "vitest"
import { detectIntent } from "../src/hooks/intent-detector"

describe("detectIntent", () => {
  it("classifies /fd- commands as unknown intent", async () => {
    const result = await detectIntent("/fd-task add auth", "/tmp")
    // /fd-task is a command, not free-text; detectIntent doesn't classify commands
    expect(result.intent).toBe("unknown")
  })

  it("scores status keywords as trivial intent", async () => {
    const result = await detectIntent("status", "/tmp")
    expect(result.intent).toBe("trivial")
    expect(result.confidence).toBeGreaterThan(0)
  })

  it("scores resume/continue as explore intent", async () => {
    const result = await detectIntent("resume", "/tmp")
    expect(result.intent).toBe("explore")
  })

  it("scores bugfix keywords as bugfix intent", async () => {
    const result = await detectIntent("fix the login crash", "/tmp")
    expect(result.intent).toBe("bugfix")
  })

  it("scores add/build/create as ui-heavy when UI keywords present", async () => {
    const result = await detectIntent("build a dashboard page", "/tmp")
    expect(result.intent).toBe("ui-heavy")
    expect(result.confidence).toBeGreaterThan(0)
  })

  it("scores feature verbs without UI keywords as unknown", async () => {
    const result = await detectIntent("implement API endpoint", "/tmp")
    expect(result.intent).toBe("unknown")
    expect(result.scores).toBeDefined()
  })

  it("scores multiple bugfix keywords with higher confidence than single keyword", async () => {
    const single = await detectIntent("fix bug", "/tmp")
    const multi = await detectIntent("fix bug error broken crash fails failing", "/tmp")
    expect(multi.confidence).toBeGreaterThan(single.confidence)
  })

  it("caps confidence at 1.0", async () => {
    const result = await detectIntent(
      "fix bug error broken crash fails failing broken error bug fix",
      "/tmp"
    )
    expect(result.confidence).toBe(1)
  })

  it("returns RoutingScores with all pipeline dimensions", async () => {
    const result = await detectIntent("add feature", "/tmp")
    expect(result.scores).toHaveProperty("explore")
    expect(result.scores).toHaveProperty("research")
    expect(result.scores).toHaveProperty("architect")
    expect(result.scores).toHaveProperty("plan")
    expect(result.scores).toHaveProperty("execute")
    expect(result.scores).toHaveProperty("qa")
    expect(result.scores).toHaveProperty("ship")
  })

  it("returns zero confidence for no-match input", async () => {
    const result = await detectIntent("hello world", "/tmp")
    expect(result.intent).toBe("unknown")
    expect(result.confidence).toBe(0)
  })
})
