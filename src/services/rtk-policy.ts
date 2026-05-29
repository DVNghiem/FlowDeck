/**
 * rtk-policy — command wrapping policy for rtk integration.
 *
 * Determines which commands benefit from rtk output compression and which
 * should be passed through unchanged. The policy is intentionally conservative:
 * when in doubt, don't wrap.
 *
 * Wrapping benefits:
 * - Commands with large, repetitive, or progress-heavy output
 * - Commands where compressed output preserves the signal
 *
 * Do NOT wrap:
 * - Commands where raw output is required for correctness
 * - Commands with already-compact output (git rev-parse, git diff --name-only)
 * - Commands used for installing rtk itself (curl, sh)
 * - Structured/programmatic output (codegraph, jq, etc.)
 * - OS notification tools (notify-send, osascript, powershell)
 */

/** Commands where rtk compression provides clear value. */
const SUPPORTED_COMMANDS = new Set([
  "git",
  "npm",
  "npx",
  "bun",
  "pnpm",
  "yarn",
  "tsc",
  "eslint",
  "biome",
  "oxlint",
  "jest",
  "vitest",
  "pytest",
  "cargo",
  "docker",
  "kubectl",
  "gh",
])

/**
 * Git subcommands that already produce compact, structured output.
 * Wrapping these with rtk provides no benefit and may truncate useful data.
 */
const COMPACT_GIT_SUBCOMMANDS = new Set([
  "rev-parse",
  "hash-object",
  "cat-file",
  "ls-files",
  "ls-tree",
  "show-ref",
  "for-each-ref",
  "symbolic-ref",
  "config",
])

/**
 * Git flags/subcommand combinations that produce compact output.
 * These are checked by inspecting the args array.
 */
function isCompactGitArgs(args: string[]): boolean {
  if (args.length === 0) return false
  const sub = args[0]
  if (!sub || sub.startsWith("-")) return false
  if (COMPACT_GIT_SUBCOMMANDS.has(sub)) return true
  // `git diff --name-only` and `git diff --stat` are compact
  if (sub === "diff" && args.some(a => a === "--name-only" || a === "--name-status" || a === "--stat")) return true
  return false
}

/**
 * Commands that must never be wrapped regardless of support list.
 * These produce structured programmatic output, are used for system
 * administration, or require full raw output.
 */
const NEVER_WRAP = new Set(["codegraph", "curl", "sh", "bash", "zsh", "fish", "node", "python", "python3"])

/**
 * Determine whether a command should be wrapped with rtk.
 * Returns true only when compression is expected to improve signal quality.
 */
export function shouldWrapWithRtk(cmd: string, args: string[]): boolean {
  const normalizedCmd = cmd.toLowerCase()

  // Absolute exclusions
  if (NEVER_WRAP.has(normalizedCmd)) return false

  // Must be in the support list
  if (!SUPPORTED_COMMANDS.has(normalizedCmd)) return false

  // Git: skip compact subcommands
  if (normalizedCmd === "git" && isCompactGitArgs(args)) return false

  return true
}

/** Returns the full list of supported commands for diagnostics/documentation. */
export function getSupportedCommands(): string[] {
  return [...SUPPORTED_COMMANDS].sort()
}
