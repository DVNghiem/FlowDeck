import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { scorePatch, patchTrustHook } from "./patch-trust"
import { codebaseDir } from "../tools/codebase-state"
import { writeFileSync } from "fs"

const TMP = join(process.cwd(), ".test-tmp-patch-trust")

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(join(TMP, ".codebase"), { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

function writeVolatility(entries: Array<{ path: string; stability: string }>) {
  const p = join(codebaseDir(TMP), "VOLATILITY.json")
  writeFileSync(p, JSON.stringify({ entries }), "utf-8")
}

function writeFailures(paths: string[]) {
  const p = join(codebaseDir(TMP), "FAILURES.json")
  const entries = paths.map(pp => ({ id: pp, affected_paths: [pp] }))
  writeFileSync(p, JSON.stringify({ entries }), "utf-8")
}

describe("scorePatch", () => {
  it("returns score=100 and safe verdict for clean file", () => {
    const result = scorePatch(TMP, "src/utils/format.ts")
    expect(result.score).toBe(100)
    expect(result.verdict).toBe("safe")
    expect(result.signals).toHaveLength(0)
  })

  it("penalises critical volatility zone by 40 points", () => {
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    const result = scorePatch(TMP, "src/auth/login.ts")
    expect(result.score).toBe(60)
    expect(result.verdict).toBe("review-required")
    expect(result.signals).toContain("file is in critical volatility zone")
  })

  it("penalises volatile zone by 25 points", () => {
    writeVolatility([{ path: "src/payment", stability: "volatile" }])
    const result = scorePatch(TMP, "src/payment/stripe.ts")
    expect(result.score).toBe(75)
    expect(result.verdict).toBe("review-required")
  })

  it("penalises moderate churn by 10 points", () => {
    writeVolatility([{ path: "src/api", stability: "moderate" }])
    const result = scorePatch(TMP, "src/api/routes.ts")
    expect(result.score).toBe(90)
    expect(result.verdict).toBe("safe")
  })

  it("penalises prior failure history by 20 points", () => {
    writeFailures(["src/session"])
    const result = scorePatch(TMP, "src/session/store.ts")
    expect(result.score).toBe(80)
    expect(result.signals).toContain("file has prior failure history")
  })

  it("penalises high-risk keywords in content", () => {
    const result = scorePatch(TMP, "src/billing.ts", "const token = generateJwt(); const secret = process.env.SECRET")
    expect(result.score).toBeLessThan(100)
    expect(result.signals.some(s => s.includes("high-risk keywords"))).toBe(true)
  })

  it("caps keyword penalty at 30 points", () => {
    const manyKeywords = HIGH_RISK_CONTENT
    const result = scorePatch(TMP, "src/safe.ts", manyKeywords)
    expect(result.score).toBeGreaterThanOrEqual(70) // 100 - max 30
  })

  it("score never goes below 0", () => {
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const result = scorePatch(TMP, "src/auth/token.ts", HIGH_RISK_CONTENT)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it("combined critical + failure + keywords yields high-risk verdict", () => {
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const result = scorePatch(TMP, "src/auth/token.ts", "const password = decrypt(secret)")
    expect(result.verdict).toBe("high-risk")
  })
})

describe("patchTrustHook - FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED", () => {
  beforeEach(() => {
    delete process.env.FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED
  })

  afterEach(() => {
    delete process.env.FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED
  })

  function makeCtx() {
    return { directory: TMP }
  }

  function makeOutput(filePath: string, content = "") {
    return { args: { filePath, content } }
  }

  it("allows high-risk edit when env var is unset (default off)", async () => {
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const ctx = makeCtx()
    await expect(
      patchTrustHook(ctx, { tool: "edit" }, makeOutput("src/auth/token.ts", "const password = decrypt(secret)"))
    ).resolves.toBeUndefined()
  })

  it("allows high-risk edit when env var is 'false'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED = "false"
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const ctx = makeCtx()
    await expect(
      patchTrustHook(ctx, { tool: "edit" }, makeOutput("src/auth/token.ts", "const password = decrypt(secret)"))
    ).resolves.toBeUndefined()
  })

  it("allows high-risk edit when env var is '0'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED = "0"
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const ctx = makeCtx()
    await expect(
      patchTrustHook(ctx, { tool: "edit" }, makeOutput("src/auth/token.ts", "const password = decrypt(secret)"))
    ).resolves.toBeUndefined()
  })

  it("blocks high-risk edit when env var is 'true'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED = "true"
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const ctx = makeCtx()
    await expect(
      patchTrustHook(ctx, { tool: "edit" }, makeOutput("src/auth/token.ts", "const password = decrypt(secret)"))
    ).rejects.toThrow("PATCH-TRUST HIGH-RISK")
  })

  it("blocks high-risk edit when env var is '1'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_HIGH_RISK_ENABLED = "1"
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    writeFailures(["src/auth"])
    const ctx = makeCtx()
    await expect(
      patchTrustHook(ctx, { tool: "edit" }, makeOutput("src/auth/token.ts", "const password = decrypt(secret)"))
    ).rejects.toThrow("PATCH-TRUST HIGH-RISK")
  })
})

describe("patchTrustHook - FLOWDECK_PATCH_TRUST_REVIEW_ENABLED", () => {
  beforeEach(() => {
    delete process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED
  })

  afterEach(() => {
    delete process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED
  })

  function makeCtx() {
    return { directory: TMP }
  }

  function makeOutput(filePath: string, content = "") {
    return { args: { filePath, content } }
  }

  it("allows review-required edit when env var is unset (default off)", async () => {
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts"))
    ).resolves.toBeUndefined()
  })

  it("blocks review-required edit when env var is 'true'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED = "true"
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts"))
    ).rejects.toThrow("PATCH-TRUST REVIEW-REQUIRED")
  })

  it("blocks review-required edit when env var is '1'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED = "1"
    writeVolatility([{ path: "src/auth", stability: "critical" }])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts"))
    ).rejects.toThrow("PATCH-TRUST REVIEW-REQUIRED")
  })
})

const HIGH_RISK_CONTENT = "password secret token auth crypto encrypt decrypt payment billing credit_card stripe jwt session oauth admin sudo root privilege"
