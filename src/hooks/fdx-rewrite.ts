/**
 * HOOK-05: fdx-rewrite — silently rewrites bash read/search commands to fdx equivalents.
 * Only fires when fdx is available. No warnings, no blocks — pass through unchanged if
 * no rewrite rule matches.
 *
 * Rewrite rules (first match wins):
 *   cat <file>              → fdx-read --mode auto <file>
 *   head <file>             → fdx-read --mode auto <file>
 *   tail <file>             → fdx-read --mode auto <file>
 *   grep <pat> [path]       → fdx-grep <pat> [path]
 *   find <path> -name <pat> → fdx-ls <path>
 *   find <path>             → fdx-tree <path>
 */

import { isFdxAvailable } from "./session-start"

// cat / head / tail → fdx-read
const CAT_RE = /^(?:cat|head|tail)\s+(.+)$/
// grep [-rn flags] <pattern> [path]
const GREP_RE = /^grep(?:\s+-[a-zA-Z]*r[a-zA-Z]*)?\s+(.+)$/
// find <path> -name <pattern> (with optional flags between)
const FIND_NAME_RE = /^find\s+(\S+).*-name\s+\S+/
// find <path> (no -name)
const FIND_TREE_RE = /^find\s+(\S+)/

export function rewrite(command: string): string {
  const cmd = command.trim()

  const catMatch = cmd.match(CAT_RE)
  if (catMatch) return `fdx-read --mode auto ${catMatch[1]}`

  const grepMatch = cmd.match(GREP_RE)
  if (grepMatch) {
    // Preserve everything after "grep [flags]" — fdx-grep takes pattern + path
    const rest = cmd.replace(/^grep(?:\s+-[a-zA-Z]+)?/, "").trim()
    return `fdx-grep ${rest}`
  }

  if (FIND_NAME_RE.test(cmd)) {
    const pathMatch = cmd.match(/^find\s+(\S+)/)
    if (pathMatch) return `fdx-ls ${pathMatch[1]}`
  }

  const treeMatch = cmd.match(FIND_TREE_RE)
  if (treeMatch) return `fdx-tree ${treeMatch[1]}`

  return command // no match — pass through unchanged
}

/**
 * Silently rewrite bash read/search commands to fdx equivalents when fdx is available.
 * Called as the first line of the tool.execute.before handler, before any guard runs.
 */
export function fdxRewriteHook(
  input: { tool?: string; name?: string },
  output: { args?: Record<string, unknown> },
): void {
  const tool = String(input?.tool ?? input?.name ?? "").toLowerCase()
  if (tool !== "bash" && tool !== "shell") return
  if (!isFdxAvailable()) return

  const args = output?.args
  if (!args || typeof args !== "object") return

  const command = args.command
  if (typeof command !== "string" || !command) return

  const rewritten = rewrite(command)
  if (rewritten !== command) {
    args.command = rewritten
  }
}
