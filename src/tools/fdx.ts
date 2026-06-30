import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { execFileSync, execSync } from "node:child_process"

/** Resolve fdx binary: check PATH only (installed via cargo install). */
function fdxBin(): string {
  try {
    execSync("fdx --help", { stdio: "ignore" })
    return "fdx"
  } catch {
    throw new Error("fdx not found in PATH — run /fd-doctor to diagnose")
  }
}

const FDX_TIMEOUT_MS = 30_000
const FDX_MAX_BUFFER = 50 * 1024 * 1024 // 50MB

function runFdx(args: string[]): string {
  const bin = fdxBin() // resolve lazily per call
  try {
    return execFileSync(bin, args, {
      encoding: "utf-8",
      timeout: FDX_TIMEOUT_MS,
      maxBuffer: FDX_MAX_BUFFER,
      stdio: ["pipe", "pipe", "pipe"],
    })
  } catch (err: any) {
    if (err?.code === "ENOBUFS") {
      throw new Error(
        `fdx output exceeded ${FDX_MAX_BUFFER / 1024 / 1024}MB. ` +
          `Narrow the query: lower --max-matches, use a more specific pattern, ` +
          `or scope --path to a smaller file/directory.`
      )
    }
    throw err
  }
}

// ── fdx-read ─────────────────────────────────────────────────────────────────

export const fdxReadTool: ToolDefinition = tool({
  description:
    "Read a file with token-optimized output. Prefer over native read_file for code files — " +
    "supports prototype mode (structure only), deep mode (symbol + dependencies), and raw mode.",
  args: {
    file: tool.schema.string(),
    mode: tool.schema.enum(["auto", "raw", "prototype", "deep"]).optional(),
    symbol: tool.schema.string().optional(),
    limit: tool.schema.number().optional(),
    offset: tool.schema.number().optional(),
    with_deps: tool.schema.boolean().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
    no_cache: tool.schema.boolean().optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["read", args.file]
    if (args.mode) cmd.push("--mode", args.mode)
    if (args.symbol) cmd.push("--symbol", args.symbol)
    if (args.limit !== undefined) cmd.push("--limit", String(args.limit))
    if (args.offset !== undefined) cmd.push("--offset", String(args.offset))
    if (args.with_deps !== undefined) cmd.push("--with-deps", String(args.with_deps))
    if (args.format) cmd.push("--format", args.format)
    if (args.no_cache) cmd.push("--no-cache")
    return runFdx(cmd)
  },
})

// ── fdx-search ───────────────────────────────────────────────────────────────

export const fdxSearchTool: ToolDefinition = tool({
  description:
    "Search for symbols by name across files or directories. Prefer over native grep when " +
    "looking for a specific function, class, struct, or trait by name.",
  args: {
    pattern: tool.schema.string(),
    paths: tool.schema.array(tool.schema.string()).optional(),
    kind: tool.schema.enum(["any", "function", "class", "struct", "trait", "interface", "enum", "method", "type"]).optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
    no_cache: tool.schema.boolean().optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["search", args.pattern]
    const paths = args.paths && args.paths.length > 0 ? args.paths : ["."]
    cmd.push(...paths)
    if (args.kind) cmd.push("--kind", args.kind)
    if (args.format) cmd.push("--format", args.format)
    if (args.no_cache) cmd.push("--no-cache")
    return runFdx(cmd)
  },
})

// ── fdx-grep ─────────────────────────────────────────────────────────────────

export const fdxGrepTool: ToolDefinition = tool({
  description:
    "Token-optimized grep with regex search across files. Prefer over native grep for " +
    "codebase-wide pattern matching with context lines and match capping.",
  args: {
    pattern: tool.schema.string(),
    paths: tool.schema.array(tool.schema.string()).optional(),
    context: tool.schema.number().optional(),
    fixed_strings: tool.schema.boolean().optional(),
    case_sensitive: tool.schema.boolean().optional(),
    max_matches: tool.schema.number().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["grep", args.pattern]
    const paths = args.paths && args.paths.length > 0 ? args.paths : ["."]
    cmd.push(...paths)
    if (args.context !== undefined) cmd.push("--context", String(args.context))
    if (args.fixed_strings) cmd.push("--fixed-strings")
    if (args.case_sensitive) cmd.push("--case-sensitive")
    if (args.max_matches !== undefined) cmd.push("--max-matches", String(args.max_matches))
    if (args.format) cmd.push("--format", args.format)
    return runFdx(cmd)
  },
})

// ── fdx-batch ────────────────────────────────────────────────────────────────

export const fdxBatchTool: ToolDefinition = tool({
  description:
    "Read multiple files in one call with token-optimized output. Prefer over multiple " +
    "native read_file calls when you need to understand several related files at once.",
  args: {
    patterns: tool.schema.array(tool.schema.string()),
    mode: tool.schema.enum(["prototype", "deep", "raw"]).optional(),
    symbol: tool.schema.string().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
    no_cache: tool.schema.boolean().optional(),
    max_files: tool.schema.number().optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["batch", ...args.patterns]
    if (args.mode) cmd.push("--mode", args.mode)
    if (args.symbol) cmd.push("--symbol", args.symbol)
    if (args.format) cmd.push("--format", args.format)
    if (args.no_cache) cmd.push("--no-cache")
    if (args.max_files !== undefined) cmd.push("--max-files", String(args.max_files))
    return runFdx(cmd)
  },
})

// ── fdx-impact ───────────────────────────────────────────────────────────────

export const fdxImpactTool: ToolDefinition = tool({
  description:
    "Lightweight cross-file dependency analysis. Prefer over manual file tracing when " +
    "assessing what a code change would affect or tracing dependency chains.",
  args: {
    files: tool.schema.array(tool.schema.string()),
    depth: tool.schema.number().optional(),
    direction: tool.schema.enum(["in", "out", "both"]).optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
    root: tool.schema.string().optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["impact", ...args.files]
    if (args.depth !== undefined) cmd.push("--depth", String(args.depth))
    if (args.direction) cmd.push("--direction", args.direction)
    if (args.format) cmd.push("--format", args.format)
    if (args.root) cmd.push("--root", args.root)
    return runFdx(cmd)
  },
})

// ── fdx-outline ──────────────────────────────────────────────────────────────

export const fdxOutlineTool: ToolDefinition = tool({
  description:
    "Project-wide symbol outline. Prefer over glob + read_file when orienting in an " +
    "unfamiliar codebase — shows all functions, classes, structs, and their hierarchy.",
  args: {
    paths: tool.schema.array(tool.schema.string()).optional(),
    depth: tool.schema.number().optional(),
    kind: tool.schema.string().optional(),
    min_lines: tool.schema.number().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
    no_cache: tool.schema.boolean().optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["outline"]
    const paths = args.paths && args.paths.length > 0 ? args.paths : ["."]
    cmd.push(...paths)
    if (args.depth !== undefined) cmd.push("--depth", String(args.depth))
    if (args.kind) cmd.push("--kind", args.kind)
    if (args.min_lines !== undefined) cmd.push("--min-lines", String(args.min_lines))
    if (args.format) cmd.push("--format", args.format)
    if (args.no_cache) cmd.push("--no-cache")
    return runFdx(cmd)
  },
})

// ── fdx-diff ─────────────────────────────────────────────────────────────────

export const fdxDiffTool: ToolDefinition = tool({
  description:
    "Symbol-aware git diff. Prefer over native git diff when reviewing changes — " +
    "shows which symbols changed and their context, not just line deltas.",
  args: {
    commit: tool.schema.string().optional(),
    paths: tool.schema.array(tool.schema.string()).optional(),
    staged: tool.schema.boolean().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
    no_cache: tool.schema.boolean().optional(),
    root: tool.schema.string().optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["diff"]
    if (args.commit) cmd.push(args.commit)
    if (args.staged) cmd.push("--staged")
    if (args.format) cmd.push("--format", args.format)
    if (args.no_cache) cmd.push("--no-cache")
    if (args.root) cmd.push("--root", args.root)
    if (args.paths && args.paths.length > 0) cmd.push(...args.paths)
    return runFdx(cmd)
  },
})

// ── fdx-git ──────────────────────────────────────────────────────────────────

export const fdxGitTool: ToolDefinition = tool({
  description:
    "Token-optimized git subcommands. Prefer over native git/bash for status, log, diff, " +
    "and branch operations — filters noise and caps output for token efficiency.",
  args: {
    subcommand: tool.schema.string(),
    args: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["git", args.subcommand]
    if (args.args && args.args.length > 0) cmd.push(...args.args)
    return runFdx(cmd)
  },
})

// ── fdx-ls ───────────────────────────────────────────────────────────────────

export const fdxLsTool: ToolDefinition = tool({
  description:
    "Compact directory listing. Prefer over native ls/bash for directory exploration — " +
    "groups directories first, caps entries, and returns structured output.",
  args: {
    path: tool.schema.string().optional(),
    all: tool.schema.boolean().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["ls"]
    if (args.path) cmd.push(args.path)
    if (args.all) cmd.push("--all")
    if (args.format) cmd.push("--format", args.format)
    return runFdx(cmd)
  },
})

// ── fdx-tree ─────────────────────────────────────────────────────────────────

export const fdxTreeTool: ToolDefinition = tool({
  description:
    "Gitignore-aware directory tree. Prefer over native tree/bash for project structure " +
    "visualization — respects .gitignore, skips build artifacts, and caps node count.",
  args: {
    path: tool.schema.string().optional(),
    depth: tool.schema.number().optional(),
    dirs_only: tool.schema.boolean().optional(),
    format: tool.schema.enum(["text", "json"]).optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["tree"]
    if (args.path) cmd.push(args.path)
    if (args.depth !== undefined) cmd.push("--depth", String(args.depth))
    if (args.dirs_only) cmd.push("--dirs-only")
    if (args.format) cmd.push("--format", args.format)
    return runFdx(cmd)
  },
})

// ── fdx-test ─────────────────────────────────────────────────────────────────

export const fdxTestTool: ToolDefinition = tool({
  description:
    "Failures-only test runner wrapper. Prefer over native test commands — compresses " +
    "output to show only failing tests, strips passing test noise for token efficiency.",
  args: {
    runner: tool.schema.enum(["cargo", "pytest", "jest", "vitest", "go", "rspec", "rails"]),
    args: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["test", args.runner]
    if (args.args && args.args.length > 0) cmd.push(...args.args)
    return runFdx(cmd)
  },
})

// ── fdx-lint ─────────────────────────────────────────────────────────────────

export const fdxLintTool: ToolDefinition = tool({
  description:
    "Failures-only lint wrapper. Prefer over native lint commands — compresses output " +
    "to show only issues, groups findings by file, and caps total findings.",
  args: {
    linter: tool.schema.enum(["ruff", "clippy", "tsc", "eslint", "biome", "golangci", "rubocop"]),
    args: tool.schema.array(tool.schema.string()).optional(),
  },
  async execute(args): Promise<string> {
    const cmd: string[] = ["lint", args.linter]
    if (args.args && args.args.length > 0) cmd.push(...args.args)
    return runFdx(cmd)
  },
})
