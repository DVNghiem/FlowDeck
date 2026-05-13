/**
 * Command reference validator.
 * Source of truth: REGISTERED_COMMANDS from supervisor-binding.
 * Used at startup, in tests, and by the response guardrail to prevent
 * agents from suggesting slash commands that don't exist.
 */

import { REGISTERED_COMMANDS } from "./supervisor-binding"

export interface CommandValidationResult {
  valid: boolean
  command: string
  reason?: string
}

export interface AuditResult {
  text: string
  references: string[]
  invalid: CommandValidationResult[]
  valid: CommandValidationResult[]
  hasInvalid: boolean
}

/** Regex that matches /fd-* slash commands in text */
const SLASH_CMD_RE = /\/fd-[a-z][a-z0-9-]*/g

/** Also catch bare /word references that look like wrong-prefix commands */
const BARE_CMD_RE = /\/(?!fd-)([a-z][a-z0-9-]+)/g

/**
 * Returns true if the given slash command (with or without leading slash) is registered.
 */
export function isValidCommand(ref: string): boolean {
  const name = ref.replace(/^\//, "")
  return REGISTERED_COMMANDS.includes(name)
}

/**
 * Validate a single command reference string (e.g. "/fd-plan" or "fd-plan").
 */
export function validateCommandReference(ref: string): CommandValidationResult {
  const name = ref.replace(/^\//, "")
  if (REGISTERED_COMMANDS.includes(name)) {
    return { valid: true, command: ref }
  }
  // Check if it's a bare name that corresponds to an fd- command
  const fdName = `fd-${name}`
  if (REGISTERED_COMMANDS.includes(fdName)) {
    return {
      valid: false,
      command: ref,
      reason: `Unknown command. Did you mean /fd-${name}?`,
    }
  }
  return {
    valid: false,
    command: ref,
    reason: `"${ref}" is not a registered FlowDeck command.`,
  }
}

/**
 * Extract all /fd-* slash command references from a text string.
 */
export function extractCommandReferences(text: string): string[] {
  const matches = text.match(SLASH_CMD_RE)
  return matches ? [...new Set(matches)] : []
}

/**
 * Extract bare /word references that are missing the fd- prefix.
 * Returns only those that would be valid if prefixed with fd-.
 */
export function extractBarePrefixErrors(text: string): string[] {
  const results: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(BARE_CMD_RE.source, "g")
  while ((match = re.exec(text)) !== null) {
    const bare = match[0]       // e.g. "/plan"
    const name = match[1]       // e.g. "plan"
    if (REGISTERED_COMMANDS.includes(`fd-${name}`)) {
      results.push(bare)
    }
  }
  return [...new Set(results)]
}

/**
 * Audit a text string for invalid command references.
 * Checks all /fd-* patterns against the registered command set.
 */
export function auditTextForInvalidCommands(text: string): AuditResult {
  const references = extractCommandReferences(text)
  const validRefs: CommandValidationResult[] = []
  const invalidRefs: CommandValidationResult[] = []

  for (const ref of references) {
    const result = validateCommandReference(ref)
    if (result.valid) {
      validRefs.push(result)
    } else {
      invalidRefs.push(result)
    }
  }

  return {
    text,
    references,
    valid: validRefs,
    invalid: invalidRefs,
    hasInvalid: invalidRefs.length > 0,
  }
}

/**
 * Rewrite a text string by replacing invalid /fd-* command references with
 * a note that the command is unavailable. Leaves valid commands untouched.
 */
export function rewriteInvalidCommandRefs(text: string): string {
  return text.replace(SLASH_CMD_RE, (match) => {
    if (isValidCommand(match)) return match
    return `${match} (unavailable)`
  })
}

/**
 * Return the full canonical command inventory for inspection/testing.
 */
export function getCommandInventory(): readonly string[] {
  return REGISTERED_COMMANDS
}
