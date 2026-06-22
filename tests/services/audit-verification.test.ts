import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { verifyAfterWrite, verificationLogPath } from "../../src/services/verification-layer"
import { appendAuditEvent, auditLogPath } from "../../src/services/audit-log"

describe("audit-log and verification-layer", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flowdeck-"))
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  it("should append audit events", () => {
    appendAuditEvent(dir, { kind: "guard.block", decision: "block", reason: "test" })
    expect(existsSync(auditLogPath(dir))).toBe(true)
    const lines = readFileSync(auditLogPath(dir), "utf-8").trim().split("\n")
    expect(lines.length).toBe(1)
    const event = JSON.parse(lines[0])
    expect(event.kind).toBe("guard.block")
    expect(event.timestamp).toBeDefined()
  })

  it("should verify written file passes", () => {
    const filePath = join(dir, "src", "test.ts")
    mkdirSync(join(dir, "src"), { recursive: true })
    writeFileSync(filePath, "export const x = 1\n", "utf-8")
    const event = verifyAfterWrite(dir, { tool: "write", filePath })
    expect(event.status).toBe("passed")
    expect(event.checks).toContain("file_exists")
    expect(event.checks).toContain("file_non_empty")
  })

  it("should fail verification for empty file", () => {
    const filePath = join(dir, "src", "test.ts")
    mkdirSync(join(dir, "src"), { recursive: true })
    writeFileSync(filePath, "", "utf-8")
    const event = verifyAfterWrite(dir, { tool: "write", filePath })
    expect(event.status).toBe("failed")
    expect(event.findings.length).toBeGreaterThan(0)
  })

  it("should fail verification for missing file", () => {
    const event = verifyAfterWrite(dir, { tool: "write", filePath: join(dir, "nope.ts") })
    expect(event.status).toBe("failed")
    expect(event.checks).toContain("file_missing")
  })

  it("should fail verification for forbidden path", () => {
    const filePath = join(dir, "node_modules", "x", "index.js")
    mkdirSync(join(dir, "node_modules", "x"), { recursive: true })
    writeFileSync(filePath, "x", "utf-8")
    const event = verifyAfterWrite(dir, { tool: "write", filePath })
    expect(event.status).toBe("failed")
    expect(event.checks).toContain("forbidden_path")
  })
})
