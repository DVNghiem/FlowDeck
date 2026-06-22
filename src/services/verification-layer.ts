/**
 * Verification Layer
 *
 * Writes structured verification events after write-class tools when feasible.
 * Events are appended to `.codebase/VERIFICATION.jsonl`.
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"

export type VerificationStatus = "passed" | "failed" | "skipped" | "pending"

export interface VerificationEvent {
  timestamp: string
  session_id?: string
  run_id?: string
  agent?: string
  tool: string
  file_path?: string
  status: VerificationStatus
  checks: string[]
  findings: string[]
}

export function verificationLogPath(dir: string): string {
  return join(codebaseDir(dir), "VERIFICATION.jsonl")
}

function fileExists(p: string): boolean {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

function fileIsNonEmpty(p: string): boolean {
  try {
    const content = readFileSync(p, "utf-8")
    return content.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Run lightweight post-write verification checks and append an event.
 * This is intentionally cheap: it does not run builds or tests.
 */
export function verifyAfterWrite(
  dir: string,
  input: {
    sessionID?: string
    runID?: string
    agent?: string
    tool: string
    filePath?: string
  },
): VerificationEvent {
  const checks: string[] = []
  const findings: string[] = []
  let status: VerificationStatus = "skipped"

  const filePath = input.filePath
  if (filePath) {
    status = "passed"
    if (fileExists(filePath)) {
      checks.push("file_exists")
      if (fileIsNonEmpty(filePath)) {
        checks.push("file_non_empty")
      } else {
        checks.push("file_empty")
        findings.push("written file is empty")
        status = "failed"
      }
    } else {
      checks.push("file_missing")
      findings.push("written file not found after write")
      status = "failed"
    }

    if (filePath.includes("src/") || filePath.includes("tests/")) {
      checks.push("under_source_or_tests")
    }
    if (filePath.includes("node_modules") || filePath.includes("dist")) {
      checks.push("forbidden_path")
      findings.push("write targeted a generated/dependency path")
      status = "failed"
    }
  }

  const event: VerificationEvent = {
    timestamp: new Date().toISOString(),
    session_id: input.sessionID,
    run_id: input.runID,
    agent: input.agent,
    tool: input.tool,
    file_path: filePath,
    status,
    checks,
    findings,
  }

  try {
    const cd = codebaseDir(dir)
    if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
    appendFileSync(verificationLogPath(dir), JSON.stringify(event) + "\n", "utf-8")
  } catch {
    // Verification logging is best-effort.
  }

  return event
}
