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

  it("penalises prior failure history by 20 points", () => {
    writeFailures(["src/session"])
    const result = scorePatch(TMP, "src/session/store.ts")
    expect(result.score).toBe(80)
    expect(result.verdict).toBe("safe")
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

  it("combined failures + keywords yields review-required verdict", () => {
    writeFailures(["src/auth"])
    const result = scorePatch(TMP, "src/auth/token.ts", "const password = 'secret'")
    expect(result.score).toBeLessThan(80)
    expect(result.verdict).toBe("review-required")
  })

  it("score never goes below 0", () => {
    writeFailures(["src/auth"])
    const result = scorePatch(TMP, "src/auth/token.ts", HIGH_RISK_CONTENT)
    expect(result.score).toBeGreaterThanOrEqual(0)
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
    writeFailures(["src/auth"])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts", "const password = 'x'"))
    ).resolves.toBeUndefined()
  })

  it("allows review-required edit when env var is 'false'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED = "false"
    writeFailures(["src/auth"])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts", "const password = 'x'"))
    ).resolves.toBeUndefined()
  })

  it("allows review-required edit when env var is '0'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED = "0"
    writeFailures(["src/auth"])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts", "const password = 'x'"))
    ).resolves.toBeUndefined()
  })

  it("blocks review-required edit when env var is 'true'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED = "true"
    writeFailures(["src/auth"])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts", "const password = 'x'"))
    ).rejects.toThrow("PATCH-TRUST REVIEW-REQUIRED")
  })

  it("blocks review-required edit when env var is '1'", async () => {
    process.env.FLOWDECK_PATCH_TRUST_REVIEW_ENABLED = "1"
    writeFailures(["src/auth"])
    await expect(
      patchTrustHook(makeCtx(), { tool: "edit" }, makeOutput("src/auth/login.ts", "const password = 'x'"))
    ).rejects.toThrow("PATCH-TRUST REVIEW-REQUIRED")
  })
})

const HIGH_RISK_CONTENT = "password secret token auth crypto encrypt decrypt payment billing credit_card stripe jwt session oauth admin sudo root privilege"
