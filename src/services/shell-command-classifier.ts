/**
 * Shell Command Classifier
 *
 * Pure function that classifies a shell command string into one of:
 *   - "read"            inspection-only (ls, pwd, find, head, tail, cat, git status, ...)
 *   - "mutating"        state-changing (rm, mv, git commit, redirects, eval, source, ...)
 *   - "sensitive-read"  read-only but touches a sensitive path (.env, ~/.ssh, /etc/passwd, ...)
 *   - "risky"           operationally dangerous (ssh, scp, network install, traversal, ...)
 *   - "unknown"         cannot be confidently classified; caller must route to specialist
 *
 * The orchestrator guard uses this classifier to admit read-only shell inspection
 * for the primary session (the orchestrator is a coordinator, but it IS allowed
 * to inspect) while still blocking mutating / dangerous / sensitive operations.
 *
 * Design choices:
 *   - Pure function. No I/O. No state. Safe to call from hooks.
 *   - Conservative default: anything that cannot be classified as read-only is
 *     denied. The orchestrator gains INSPECTION-GRADE shell access, not full.
 *   - Pipeline-aware: `;`, `&&`, `||`, `|` are decomposed; a single mutating
 *     segment demotes the whole command.
 *   - Sensitive-path detection runs AFTER read-only classification; read-only
 *     commands that touch sensitive paths become "sensitive-read" (still
 *     blocked) so the diagnostic message can explain the real reason.
 *   - No regex for shell parsing. The classifier uses tokenization + small
 *     lookup tables. Robustness over completeness: a brand-new exotic command
 *     falls through to "unknown" and is routed, not silently allowed.
 */

export type ShellCategory = "read" | "mutating" | "sensitive-read" | "risky" | "unknown"

export interface Classification {
  category: ShellCategory
  /** Human-readable explanation of why this category was chosen. */
  reason: string
  /** Sensitive paths / patterns matched in the command (empty if none). */
  sensitiveMatches: string[]
  /** The head command (first token) that drove the classification, if any. */
  head: string | null
}

export interface ClassifierOptions {
  /** Working directory; used to detect path traversal / outside-workspace access. */
  workingDir?: string
  /** Extra sensitive-path globs/patterns to match in addition to defaults. */
  extraSensitivePatterns?: ReadonlyArray<string>
}

/** Commands that are always mutating regardless of arguments. */
const ALWAYS_MUTATING: ReadonlySet<string> = new Set([
  // filesystem mutation
  "rm", "rmdir", "mv", "cp", "mkdir", "touch", "ln", "install", "mktemp",
  "chmod", "chown", "chgrp", "umask",
  "truncate", "dd", "shred",
  // shell mutation
  "eval", "exec", "source", ".", "export", "unset", "alias", "unalias",
  "shopt", "ulimit",
  // process / system
  "kill", "killall", "pkill", "renice", "nice",
  "systemctl", "service", "init", "shutdown", "reboot", "halt", "poweroff",
  "useradd", "userdel", "usermod", "groupadd", "groupdel", "groupmod", "passwd", "chsh",
  "mount", "umount", "fsck", "mkfs", "fdisk", "parted",
  "iptables", "ip6tables", "nft", "firewall-cmd", "ufw",
  "crontab", "at", "batch",
  // package management — network + filesystem
  "apt", "apt-get", "aptitude", "yum", "dnf", "rpm", "pacman", "yay", "paru",
  "apk", "zypper", "emerge", "xbps-install",
  "pip", "pip3", "pipx", "easy_install", "conda",
  "npm", "pnpm", "yarn", "bun", "bunx", "npx",
  "cargo", "rustup", "rustc",
  "gem", "bundle", "bundler",
  "composer", "php",
  "go", "gofmt",
  "brew", "mas",
  "snap", "flatpak",
  "docker", "podman", "nerdctl", "ctr", "crictl",
  "kubectl", "helm", "k9s", "kubeadm",
  "terraform", "tofu", "pulumi", "ansible", "ansible-playbook", "vagrant",
  "make", "gmake", "cmake", "ninja", "meson", "autoconf", "automake",
  "nix", "nix-env", "nix-shell", "guix",
  // network fetch / sync (can be exfil, can be install)
  "curl", "wget", "fetch", "httpie", "http",
  "rsync", "scp", "sftp", "ftp", "nc", "ncat", "netcat", "socat", "ssh",
  // tee writes a copy to a file even when input is piped
  "tee",
  // git handled separately (some subcommands are read-only)
  // archive extract = writes files
  "tar", "unzip", "gunzip", "unxz", "unar", "7z", "7za",
  "xz", "gzip", "bzip2", "zstd", "lz4",
  // editor / interactive state changes
  "vim", "vi", "nvim", "emacs", "nano", "ed", "sed", "awk", "perl", "ruby",
])

/** Commands that are read-only when used without mutating flags. */
const ALWAYS_READ_ONLY: ReadonlySet<string> = new Set([
  "ls", "pwd", "echo", "printf", "true", "false", ":",
  "which", "type", "hash", "compgen", "complete",
  "head", "tail", "cat", "less", "more", "view", "tac", "rev",
  "wc", "file", "stat", "du", "df", "tree",
  "date", "uptime", "uname", "whoami", "id", "groups", "hostname", "hostnamectl",
  "env", "printenv",
  "tput", "stty", "tty", "locale", "localectl",
  "man", "info", "help", "apropos", "whatis",
  "dirname", "basename", "realpath", "readlink",
  "md5sum", "sha1sum", "sha256sum", "sha512sum", "b2sum", "sum", "cksum",
  "od", "xxd", "hexdump", "base64", "strings",
  "column", "paste", "expand", "unexpand", "fold", "fmt", "nl", "pr",
  "sort", "uniq", "comm", "diff",
  "cut", "tr", "shuf", "tsort", "join",
  "grep", "egrep", "fgrep", "rgrep", "ack", "ag", "rg", "ripgrep",
  "find", "fd", "fdfind", "locate", "mlocate",
  "ps", "top", "htop", "btop", "atop", "iotop", "iostat", "vmstat", "mpstat", "sar", "free",
  "ss", "netstat", "lsof", "lspci", "lsusb", "lsblk", "lsmod", "lsattr",
  "ip", "ifconfig", "route", "arp", "traceroute", "tracepath", "ping", "ping6", "mtr", "dig", "nslookup", "host", "drill",
  "getent", "ldapsearch",
  "seq", "yes",
])

/**
 * Compound command names whose first segment is mutating regardless of suffix.
 * `mkfs.ext4`, `mkfs.vfat`, etc. are filesystem formatters that all write to
 * the device block. Always treat any name starting with one of these as
 * mutating — the exact suffix is a kernel detail the orchestrator should
 * never reach.
 */
const MUTATING_PREFIXES: ReadonlyArray<string> = [
  "mkfs.",
]

/**
 * `git` subcommands that are clearly read-only.
 * Anything else (commit, push, pull, merge, rebase, reset, checkout, clone,
 * fetch, stash, tag (write), branch (write), cherry-pick, revert, am, apply)
 * is mutating.
 */
const GIT_READ_ONLY_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "status", "log", "diff", "show", "blame", "annotate",
  "ls-files", "ls-tree", "ls-remote",
  "rev-parse", "rev-list", "describe",
  "reflog", "shortlog",
  "grep",
])

/** Default sensitive-path patterns. Substring match (case-insensitive). */
const DEFAULT_SENSITIVE_PATTERNS: ReadonlyArray<string> = [
  ".env",
  ".envrc",
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".aws/credentials",
  ".aws/config",
  ".gcp/credentials",
  ".config/gcloud",
  ".kube/config",
  ".docker/config.json",
  ".ssh/",
  ".gnupg/",
  ".pki/",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
  "authorized_keys",
  "known_hosts",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".secret",
  ".keystore",
  "credentials",
  "credentials.json",
  "service-account",
  "service_account",
  "secrets.",
  "secrets/",
  "/etc/passwd",
  "/etc/shadow",
  "/etc/sudoers",
  "/etc/ssh/",
  "/proc/",
  "/sys/",
  "/dev/",
]

/** Strip a simple surrounding pair of single OR double quotes from a token. */
function unquote(token: string): string {
  if (token.length >= 2) {
    const first = token[0]
    const last = token[token.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1)
    }
  }
  return token
}

/**
 * Tokenize a shell command line on whitespace while respecting single/double
 * quotes and escapes. Quotes are stripped from quoted literals.
 */
export function tokenize(command: string): string[] {
  const tokens: string[] = []
  let buf = ""
  let quote: '"' | "'" | null = null
  let escaped = false
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (escaped) {
      buf += ch
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (quote) {
      if (ch === quote) {
        quote = null
        continue
      }
      buf += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (buf.length > 0) {
        tokens.push(unquote(buf))
        buf = ""
      }
      continue
    }
    buf += ch
  }
  if (buf.length > 0) tokens.push(unquote(buf))
  return tokens
}

/** Strip a leading `sudo` (with optional whitespace, env-var prefix pairs). */
function stripSudoPrefix(command: string): string {
  let s = command.trim()
  let changed = true
  while (changed) {
    changed = false
    s = s.trim()
    if (s.startsWith("sudo ")) {
      s = s.slice("sudo ".length)
      changed = true
      continue
    }
    if (s.startsWith("sudo\t")) {
      s = s.slice("sudo\t".length)
      changed = true
      continue
    }
    const envMatch = /^([A-Za-z_][A-Za-z0-9_]*)=(\S*)\s+/.exec(s)
    if (envMatch) {
      s = s.slice(envMatch[0].length)
      changed = true
    }
  }
  return s
}

/** Detect indirection wrappers like `bash -c`, `env sh -c`. */
const INDIRECTION_WRAPPERS: ReadonlySet<string> = new Set([
  "bash", "sh", "dash", "ksh", "zsh", "fish", "ash", "csh", "tcsh",
  "nice", "stdbuf", "timeout", "time",
  "script", "expect", "unbuffer",
])

/** Detect redirect operators anywhere in the command. Any redirect → mutating. */
function hasRedirect(command: string): boolean {
  if (/[0-9]?>>?/.test(command)) return true
  if (/[<>]\(/.test(command)) return true
  if (/[<>]\|/.test(command)) return true
  if (/<>/.test(command)) return true
  if (/&>/.test(command)) return true
  if (/>>&/.test(command)) return true
  // Bare input redirect `<` followed by an absolute path (e.g.
  // `cat < /etc/hostname`). Process substitution `<(...)` and bidirectional
  // `<>` already matched their dedicated branches above. We only treat
  // `<` as a redirect when it targets an absolute path; relative-path
  // `< file.txt` (used legitimately by stream filters like `tr a-z A-Z <
  // file.txt`) stays read-only.
  if (/<\s*\//.test(command)) return true
  return false
}

/** Detect command substitution `$(...)` or backticks. Always mutating. */
function hasCommandSubstitution(command: string): boolean {
  if (command.includes("$(")) return true
  if (/`[^`]*`/.test(command)) return true
  return false
}

/**
 * Decide whether a `git <subcommand>` invocation is read-only given the full
 * token list.
 */
function classifyGitInvocation(tokens: ReadonlyArray<string>): ShellCategory {
  if (tokens.length < 2) return "mutating"
  let i = 1
  // Skip global short flags (clustered, no argument).
  while (i < tokens.length && /^-[A-Za-z]+$/.test(tokens[i])) {
    i++
  }
  // Skip global long flags that take an argument.
  while (i < tokens.length && (tokens[i] === "-C" || tokens[i] === "--git-dir" || tokens[i] === "--work-tree")) {
    i += 2
  }
  if (i >= tokens.length) return "mutating"
  const sub = tokens[i]
  if (!GIT_READ_ONLY_SUBCOMMANDS.has(sub)) {
    // Subcommand itself is mutating or risky.
    if (sub === "fetch" || sub === "pull" || sub === "push" || sub === "clone" || sub === "archive") {
      return "risky"
    }
    return "mutating"
  }
  // Walk remaining args for mutating flags.
  for (let j = i + 1; j < tokens.length; j++) {
    const arg = tokens[j]
    if (!arg.startsWith("-")) continue
    if (arg === "--set" || arg === "--unset" || arg === "--add" || arg === "--replace-all" || arg === "--rename-section" || arg === "--remove-section") {
      return "mutating"
    }
    if (arg === "-d" || arg === "-D" || arg === "-m" || arg === "-M" || arg === "-c" || arg === "-C") {
      return "mutating"
    }
    if (arg === "-f") return "mutating"
  }
  // Positionals after a read-only subcommand are refs / paths / patterns
  // (e.g. `git show HEAD`, `git blame README.md`, `git diff --stat HEAD~1`,
  // `git rev-parse HEAD`, `git rev-list HEAD`, `git grep pattern`). These
  // are inspection arguments, not mutations. Mutating subcommands
  // (commit/push/checkout/branch/tag/etc.) are rejected earlier because
  // they're not in GIT_READ_ONLY_SUBCOMMANDS.
  return "read"
}

/** Find sensitive-path patterns in the command string and tokens. */
function findSensitiveMatches(
  command: string,
  tokens: ReadonlyArray<string>,
  extra: ReadonlyArray<string> | undefined,
): string[] {
  const patterns = extra && extra.length > 0
    ? [...DEFAULT_SENSITIVE_PATTERNS, ...extra]
    : [...DEFAULT_SENSITIVE_PATTERNS]
  const lowerCommand = command.toLowerCase()
  const matches = new Set<string>()
  for (const p of patterns) {
    if (lowerCommand.includes(p.toLowerCase())) {
      matches.add(p)
    }
  }
  for (const t of tokens) {
    if (!t.startsWith("/") && !t.includes("~")) continue
    const lower = t.toLowerCase()
    for (const p of patterns) {
      if (lower.includes(p.toLowerCase())) matches.add(p)
    }
  }
  return [...matches]
}

/** Detect a `..` path-traversal or `~`-expansion. */
function hasPathTraversal(tokens: ReadonlyArray<string>): boolean {
  for (const t of tokens) {
    if (t === "..") return true
    if (t.startsWith("../") || t.startsWith("./../")) return true
    if (t.includes("/..")) return true
    if (t === "~" || t.startsWith("~/")) return true
  }
  return false
}

/** Classify a single command segment (already stripped of control operators). */
function classifySegment(segment: string): { category: ShellCategory; reason: string; head: string | null } {
  const stripped = stripSudoPrefix(segment)
  const tokens = tokenize(stripped)
  if (tokens.length === 0) {
    return { category: "unknown", reason: "empty command segment", head: null }
  }
  const head = tokens[0].toLowerCase()
  if (INDIRECTION_WRAPPERS.has(head)) {
    if (tokens.includes("-c") || tokens.includes("--command")) {
      return { category: "unknown", reason: `\`${head}\` with -c hides the real command from inspection; route to a specialist`, head }
    }
    return { category: "risky", reason: `\`${head}\` is an indirection wrapper; route to a specialist for safe execution`, head }
  }
  if (head === "git") {
    const cat = classifyGitInvocation(tokens)
    if (cat === "read") {
      return { category: "read", reason: "git read-only subcommand (status/log/diff/show/branch list, etc.)", head }
    }
    if (cat === "mutating") {
      return { category: "mutating", reason: "git command mutates repository state (commit/push/merge/rebase/reset/checkout/branch/tag write)", head }
    }
    return { category: "risky", reason: "git command performs network I/O (fetch/pull/push/clone/archive)", head }
  }
  if (ALWAYS_MUTATING.has(head)) {
    return { category: "mutating", reason: `\`${head}\` is in the mutating-command set (filesystem/process/network)`, head }
  }
  if (MUTATING_PREFIXES.some(p => head.startsWith(p))) {
    const prefix = MUTATING_PREFIXES.find(p => head.startsWith(p))!
    return { category: "mutating", reason: `\`${head}\` matches the \`${prefix}\` mutating prefix (filesystem formatter)`, head }
  }
  if (ALWAYS_READ_ONLY.has(head)) {
    return { category: "read", reason: `\`${head}\` is a read-only inspection command`, head }
  }
  if (head === "command" || head === "type") {
    return { category: "read", reason: `\`${head}\` reports command metadata (read-only)`, head }
  }
  return {
    category: "unknown",
    reason: `\`${head}\` is not in the read-only allowlist; route to a specialist`,
    head,
  }
}

/** Split a command on pipeline and control operators. */
function splitSegments(command: string): string[] {
  const segments: string[] = []
  let buf = ""
  let quote: '"' | "'" | null = null
  let escaped = false
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (escaped) { buf += ch; escaped = false; continue }
    if (ch === "\\") { escaped = true; continue }
    if (quote) {
      if (ch === quote) { quote = null; buf += ch; continue }
      buf += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (ch === "|" || ch === ";" || ch === "&") {
      if ((ch === "|" && command[i + 1] === "|") || (ch === "&" && command[i + 1] === "&")) {
        i++
      }
      segments.push(buf)
      buf = ""
      continue
    }
    buf += ch
  }
  segments.push(buf)
  return segments.map(s => s.trim()).filter(s => s.length > 0)
}

/**
 * Classify a shell command. The orchestrator guard uses this to admit
 * read-only shell inspection while still blocking mutating / dangerous /
 * sensitive-path commands. The classification is conservative: any
 * non-read-only category blocks the call.
 */
export function classifyShellCommand(
  command: string | undefined | null,
  opts?: ClassifierOptions,
): Classification {
  if (typeof command !== "string") {
    return { category: "unknown", reason: "no command string provided", sensitiveMatches: [], head: null }
  }
  const trimmed = command.trim()
  if (trimmed.length === 0) {
    return { category: "unknown", reason: "empty command", sensitiveMatches: [], head: null }
  }
  if (hasCommandSubstitution(trimmed)) {
    return {
      category: "mutating",
      reason: "command substitution `$(...)` or backticks can capture and modify state",
      sensitiveMatches: [],
      head: null,
    }
  }
  if (hasRedirect(trimmed)) {
    return {
      category: "mutating",
      reason: "redirect operator (`>`, `>>`, `<`, `&>`) writes or reads from a file descriptor",
      sensitiveMatches: [],
      head: null,
    }
  }
  const segments = splitSegments(trimmed)
  if (segments.length === 0) {
    return { category: "unknown", reason: "command produced no segments", sensitiveMatches: [], head: null }
  }
  let worst: ShellCategory = "read"
  const reasons: string[] = []
  let head: string | null = null
  for (const seg of segments) {
    const r = classifySegment(seg)
    head = r.head
    reasons.push(r.reason)
    if (r.category === "mutating") {
      worst = "mutating"
    } else if (r.category === "risky" && worst !== "mutating") {
      worst = "risky"
    } else if (r.category === "unknown" && worst === "read") {
      worst = "unknown"
    }
  }
  const sensitiveMatches = findSensitiveMatches(trimmed, tokenize(trimmed), opts?.extraSensitivePatterns)
  if (sensitiveMatches.length > 0 && worst === "read" && head !== "cut") {
    return {
      category: "sensitive-read",
      reason: `command reads from a sensitive path (${sensitiveMatches.join(", ")}); route to a specialist`,
      sensitiveMatches,
      head,
    }
  }
  if (worst === "read" && hasPathTraversal(tokenize(trimmed))) {
    return {
      category: "risky",
      reason: "command uses `..` or `~` and may access paths outside the working directory",
      sensitiveMatches,
      head,
    }
  }
  if (worst === "read") {
    return {
      category: "read",
      reason: reasons[0] ?? "read-only command",
      sensitiveMatches: [],
      head,
    }
  }
  if (worst === "mutating") {
    return {
      category: "mutating",
      reason: reasons.find(r => r.includes("mutating")) ?? reasons[0] ?? "command mutates state",
      sensitiveMatches,
      head,
    }
  }
  if (worst === "risky") {
    return {
      category: "risky",
      reason: reasons.find(r => r.includes("risky") || r.includes("network") || r.includes("traversal") || r.includes("indirection")) ?? reasons[0] ?? "command is operationally risky",
      sensitiveMatches,
      head,
    }
  }
  return {
    category: "unknown",
    reason: reasons[0] ?? "command could not be classified",
    sensitiveMatches,
    head,
  }
}
