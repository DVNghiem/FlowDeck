/**
 * Audit Log Service
 *
 * Append-only structured event log used by guards, supervisor, recovery,
 * and lifecycle hooks. Writes to `.codebase/AUDIT.jsonl`.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"

export type AuditEventKind =
  | "guard.allow"
  | "guard.block"
  | "guard.warn"
  | "supervisor.decision"
  | "recovery.action"
  | "verification.event"
  | "lifecycle.transition"
  | "routing.decision"

export interface AuditEvent {
  kind: AuditEventKind
  timestamp: string
  session_id?: string
  run_id?: string
  agent?: string
  tool?: string
  decision?: string
  reason?: string
  details?: Record<string, unknown>
}

export function auditLogPath(dir: string): string {
  return join(codebaseDir(dir), "AUDIT.jsonl")
}

/**
 * Append a structured audit event. Never throws — failures are silently
 * ignored so audit logging cannot break the runtime.
 */
export function appendAuditEvent(dir: string, event: Omit<AuditEvent, "timestamp">): void {
  try {
    const cd = codebaseDir(dir)
    if (!existsSync(cd)) mkdirSync(cd, { recursive: true })
    const full: AuditEvent = { ...event, timestamp: new Date().toISOString() }
    appendFileSync(auditLogPath(dir), JSON.stringify(full) + "\n", "utf-8")
  } catch {
    // Audit logging is best-effort; never break the caller.
  }
}
