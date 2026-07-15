/**
 * FlowDeck v1 command types.
 */

import type { FdPlanState, CodebaseState } from "./state"

// ── Command context & result ────────────────────────────────────────────────

/**
 * Runtime context passed to every command handler.
 */
export interface CommandContext {
  /** Absolute path to the project root. */
  directory: string
  /** Positional arguments after the command name. */
  arguments: string[]
  /** Current task plan state. Null when no active task. */
  state: FdPlanState | null
  /** Current codebase metadata. Null when not yet indexed. */
  codebaseState: CodebaseState | null
}

/**
 * Return type for all command handlers.
 */
export interface CommandResult {
  /** True if the command succeeded. */
  success: boolean
  /** Human-readable message shown to the user. */
  message: string
  /**
   * Updated plan state. Commands that modify state return the new state here;
   * the plugin writes it back to `.fd-plan/<slug>/.state.json`.
   */
  updatedState?: FdPlanState
  /**
   * Named artifacts produced by the command.
   * Keys are relative file paths; values are the file content.
   */
  artifacts?: Record<string, string>
  /**
   * Errors that should be surfaced clearly to the user.
   * Commands should prefer a human-readable `message` over this field.
   */
  errors?: string[]
}

// ── Phase file types ─────────────────────────────────────────────────────────

/** File types produced per phase under `.fd-plan/<slug>/`. */
export type PhaseFileType = "discuss" | "plan" | "checkpoint" | "review" | "learning" | "architect"


/**
 * Command definition stored in `src/commands/*.md`.
 */
export interface CommandTemplate {
  /** Slash-command name (e.g. `fd-checkpoint`). */
  name: string
  /** Short one-line description shown in `/help`. */
  description: string
  /** Detailed usage instructions. */
  usage?: string
  /** Examples of how to invoke the command. */
  examples?: string[]
  /** Aliases that also trigger this command. */
  aliases?: string[]
  /** Whether the command requires an active task context. */
  requiresTask?: boolean
}
