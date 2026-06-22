import { describe, it, expect } from "vitest"
import { exploreRepoCached, clearExplorationCache, getExplorationCacheSize } from "../../src/services/preflight-explorer-cache"

describe("preflight-explorer-cache", () => {
  it("should explore repo and cache by metadata", async () => {
    clearExplorationCache()
    const first = await exploreRepoCached("/home/nghiem/project/flowdeck", "test task")
    expect(first.cacheHit).toBe(false)
    expect(first.result).toBeDefined()
    expect(first.derived).toBeDefined()

    const second = await exploreRepoCached("/home/nghiem/project/flowdeck", "test task")
    expect(second.cacheHit).toBe(true)
    expect(getExplorationCacheSize()).toBe(1)
  })
})
