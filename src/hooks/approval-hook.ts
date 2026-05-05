/**
 * Approval Hook
 * Intercepts write/edit operations on sensitive files and blocks them
 * unless a recent approval exists. Throws to block (per OpenCode hook contract).
 * To enable: set FLOWDECK_APPROVAL_HOOK_ENABLED=on. Default is OFF.
 */

const ENABLED = process.env.FLOWDECK_APPROVAL_HOOK_ENABLED === "on"

import { appendEvent } from "../services/telemetry"
import { isSensitivePath, checkApproval } from "../services/approval-manager"

const WRITE_TOOLS = new Set(["write_file", "edit_file", "create_file", "apply_patch", "str_replace_editor", "write"])

export async function approvalHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string },
  output: { args?: Record<string, unknown> }
): Promise<void> {
  if (!ENABLED) return

  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? ""

  if (!WRITE_TOOLS.has(tool)) return

  const args = output.args ?? {}
  const filePath: string = String(args.path ?? args.file_path ?? args.filename ?? "")

  if (!filePath) return
  if (!isSensitivePath(filePath)) return

  // Check for a recent valid approval
  const approval = checkApproval(dir, filePath, "")
  if (approval) return // approved — allow

  // Emit approval request event for dashboard visibility
  appendEvent(dir, {
    session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
    run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
    event: "approval.request",
    tool,
    status: "blocked",
    files: [filePath],
    meta: { trigger: "sensitive_file", file: filePath },
  })

  throw new Error(
    `APPROVAL_REQUIRED: "${filePath}" is a sensitive file (auth/payment/secrets/infra).\n` +
    `Risk level: HIGH — manual approval needed before editing.\n` +
    `To proceed: run /fd-guarded-edit --file "${filePath}" to review and approve this change.`
  )
}
