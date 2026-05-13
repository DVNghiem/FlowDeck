/**
 * HOOK: Command Reference Guard
 * Post-response hook that scans agent output for /fd-* slash command references
 * and warns when an invalid (unregistered) command is found.
 *
 * This is a lightweight advisory guardrail — it emits a warning comment
 * at the top of the response rather than blocking it, preserving usability
 * while surfacing drift for developers to fix.
 */

import { auditTextForInvalidCommands, extractBarePrefixErrors } from "../services/command-validator"

/**
 * Scan an agent response string and return a warning prefix if any invalid
 * command references are detected. Returns null if response is clean.
 */
export function buildCommandRefWarning(response: string): string | null {
  const audit = auditTextForInvalidCommands(response)
  const bareErrors = extractBarePrefixErrors(response)

  const issues: string[] = []

  for (const inv of audit.invalid) {
    issues.push(inv.reason ?? `"${inv.command}" is not a registered command`)
  }

  for (const bare of bareErrors) {
    const corrected = `/fd-${bare.slice(1)}`
    issues.push(`"${bare}" should be "${corrected}"`)
  }

  if (issues.length === 0) return null

  const lines = ["⚠️ **[FlowDeck]** This response references unregistered commands:", ""]
  for (const issue of issues) {
    lines.push(`- ${issue}`)
  }
  lines.push("", "Use only commands listed in `/fd-status` or the command reference docs.", "")

  return lines.join("\n")
}

/**
 * Apply the command reference guardrail to an agent response.
 * If invalid command references are found, prepend a warning block.
 * If clean, return the response unchanged.
 */
export function applyCommandRefGuard(response: string): string {
  const warning = buildCommandRefWarning(response)
  if (!warning) return response
  return warning + response
}
