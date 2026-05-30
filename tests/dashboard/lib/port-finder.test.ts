import { describe, it, expect } from "vitest"
import { findOpenPort } from "@/dashboard/lib/port-finder"

describe("port-finder", () => {
  it("should find an open port starting from default", async () => {
    const result = await findOpenPort(3456, 10)
    expect(result.port).toBeGreaterThanOrEqual(3456)
    expect(result.host).toBe("localhost")
  })

  it("should find an open port when startPort is specified", async () => {
    const result = await findOpenPort(4000, 10)
    expect(result.port).toBeGreaterThanOrEqual(4000)
    expect(result.host).toBe("localhost")
  })

  it("should return first available port in range", async () => {
    const result = await findOpenPort(5000, 100)
    expect(result.port).toBeGreaterThanOrEqual(5000)
    expect(result.port).toBeLessThan(5100)
  })
})