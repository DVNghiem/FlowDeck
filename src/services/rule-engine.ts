/**
 * Rule Engine
 *
 * Deterministic checks that bypass model calls for questions answerable without
 * LLM reasoning. Only safe when the check type is explicitly specified by the
 * caller — never inferred from free-form natural language.
 *
 * Every public function returns a CheckResult<T> with deterministic: true,
 * making it clear to the call-site that no model was used.
 */
import { existsSync } from "fs"

export type CheckType =
  | "file_exists"
  | "json_valid"
  | "detect_language"
  | "classify_command"
  | "is_nonempty"
  | "contains_keyword"

export interface CheckResult<T> {
  type: CheckType
  value: T
  /** Always true — signals this result came from deterministic code, not a model. */
  deterministic: true
}

// ----- File existence -----

/** Check whether a file path exists on disk. */
export function checkFileExists(filePath: string): CheckResult<boolean> {
  return { type: "file_exists", value: existsSync(filePath), deterministic: true }
}

// ----- JSON validation -----

export interface JSONValidResult {
  valid: boolean
  error?: string
}

/** Check whether a string is valid JSON. */
export function checkJSONValid(text: string): CheckResult<JSONValidResult> {
  try {
    JSON.parse(text)
    return { type: "json_valid", value: { valid: true }, deterministic: true }
  } catch (e) {
    return {
      type: "json_valid",
      value: { valid: false, error: (e as Error).message },
      deterministic: true,
    }
  }
}

// ----- Language detection -----

const EXT_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", pyw: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp", cc: "cpp", cxx: "cpp",
  c: "c",
  swift: "swift",
  sh: "bash", bash: "bash", zsh: "bash",
  json: "json", jsonc: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  md: "markdown", mdx: "markdown",
  html: "html", htm: "html",
  css: "css", scss: "css", less: "css",
  sql: "sql",
}

/** Detect programming language from file extension. Returns null for unknown extensions. */
export function detectLanguage(filename: string): CheckResult<string | null> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  return { type: "detect_language", value: EXT_MAP[ext] ?? null, deterministic: true }
}

// ----- Command classification -----

export type CommandClass =
  | "read"     // purely reads state, no side effects
  | "write"    // creates or modifies files/state
  | "delete"   // removes files/state
  | "run"      // executes processes/commands
  | "navigate" // moves between workflow stages
  | "unknown"

const COMMAND_PREFIX_MAP: Array<[string[], CommandClass]> = [
  [["get", "read", "fetch", "list", "show", "describe", "inspect", "view", "check", "search", "find", "query", "status"], "read"],
  [["write", "create", "update", "edit", "save", "add", "insert", "set", "put", "patch", "append", "push"], "write"],
  [["delete", "remove", "drop", "clear", "purge", "clean", "destroy"], "delete"],
  [["run", "exec", "execute", "start", "deploy", "build", "test", "compile", "install", "launch"], "run"],
  [["go", "move", "navigate", "next", "prev", "switch", "transition"], "navigate"],
]

/** Classify a tool/command name into its operational class. */
export function classifyCommandType(command: string): CheckResult<CommandClass> {
  const cmd = command.trim().toLowerCase()
  for (const [prefixes, cls] of COMMAND_PREFIX_MAP) {
    if (prefixes.some(p => cmd.startsWith(p))) {
      return { type: "classify_command", value: cls, deterministic: true }
    }
  }
  return { type: "classify_command", value: "unknown", deterministic: true }
}

// ----- Non-empty check -----

/** Check whether a string is non-empty after trimming. */
export function checkIsNonEmpty(text: string): CheckResult<boolean> {
  return { type: "is_nonempty", value: text.trim().length > 0, deterministic: true }
}

// ----- Keyword search -----

export interface KeywordSearchResult {
  found: boolean
  matched?: string
}

/** Check whether a string contains any of the given keywords (case-insensitive). */
export function checkContainsKeyword(
  text: string,
  keywords: string[],
): CheckResult<KeywordSearchResult> {
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { type: "contains_keyword", value: { found: true, matched: kw }, deterministic: true }
    }
  }
  return { type: "contains_keyword", value: { found: false }, deterministic: true }
}
