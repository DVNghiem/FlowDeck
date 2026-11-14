import { existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"

const answer = (decision, reason) => ({ decision, reason })

function canonical(path) {
  if (existsSync(path)) return realpathSync(path)
  const parent = dirname(path)
  if (parent === path) throw new Error("Cannot resolve path")
  return join(canonical(parent), path.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
}

function targetPath(value, cwd) {
  const expanded = value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value
  return canonical(isAbsolute(expanded) ? expanded : resolve(cwd, expanded))
}

function inside(path, root) {
  return path === root || path.startsWith(root + sep)
}

function shellWords(command) {
  const words = command.match(/(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s'"`$;&|<>])+|[`$;&|<>]/g)
  if (!words) return []
  return words.map((word) => word.startsWith("'") || word.startsWith('"') ? word.slice(1, -1) : word)
}

function checkPath(input, cwd, root) {
  if (typeof input !== "string" || !input.trim()) return answer("deny", "Missing file path")
  if (/[`$*?{}]/.test(input)) return answer("ask", "Path expansion cannot be verified")
  const path = targetPath(input, cwd)
  if (!inside(path, root)) return answer("deny", "Path escapes the worktree")
  if (/(^|\/)(\.env(?:\.|$)|\.ssh|\.aws|\.config\/gh|[^/]+\.(?:pem|key))(\/|$)/i.test(path)) {
    return answer("deny", "Credential path is protected")
  }
  return answer("allow", "Within worktree")
}

export function decide(event) {
  try {
    if (!event || typeof event !== "object" || typeof event.tool_name !== "string" || typeof event.cwd !== "string") {
      return answer("deny", "Malformed hook input")
    }
    const root = realpathSync(event.cwd)
    const input = event.tool_input
    if (!input || typeof input !== "object") return answer("deny", "Missing tool input")

    if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(event.tool_name)) {
      return checkPath(input.file_path ?? input.path ?? input.notebook_path, event.cwd, root)
    }
    if (event.tool_name !== "Bash") return answer("allow", "Unmonitored tool")
    if (typeof input.command !== "string" || !input.command.trim()) return answer("deny", "Missing Bash command")
    const command = input.command.trim()
    if (/(^|[\s;|])(?:cat|head|tail|less|more|sed|awk|cp)\s+[^\n]*?(?:\.env\b|\.ssh\/|\.aws\/|\.config\/gh\/|\.(?:pem|key)\b)/i.test(command)) {
      return answer("deny", "Credential read is protected")
    }
    if (/[`$;&|<>{}]/.test(command) || /\\\s*\n/.test(command)) return answer("ask", "Shell expansion or chaining requires review")
    const words = shellWords(command)
    if (words.length === 0) return answer("deny", "Empty command")
    const executable = basename(words[0])
    if (executable === "gh" && words[1] === "auth" && words[2] === "token") return answer("deny", "Credential token access is protected")
    if (/(?:^|[\s=])@(?:[^\s]*\/)?(?:\.env(?:\.[^\s]*)?|[^\s]*\.(?:pem|key))(?:\s|$)/i.test(command)) return answer("deny", "Credential file upload is protected")
    if (/^(sudo|eval|sh|bash|zsh|env|command|xargs)$/.test(executable) || /^(python(?:\d+(?:\.\d+)?)?|node|nodejs|ruby|perl)$/.test(executable)) return answer("ask", "Shell indirection requires review")
    if (/^(curl|wget|scp|ssh|sftp|nc|ncat|netcat|ftp|http|printenv)$/.test(executable)) return answer("ask", "Network or environment access requires review")
    if (executable === "find" && words.includes("-delete")) return answer("ask", "Recursive deletion requires approval")
    if (/^(mv|cp|install|tee|mkdir|touch|chmod|chown|truncate|dd|rsync|ln)$/.test(executable)) return answer("ask", "Filesystem mutation requires approval")
    if (executable === "rm") {
      const options = words.slice(1).filter((word) => word.startsWith("-"))
      const targets = words.slice(1).filter((word) => !word.startsWith("-"))
      if (targets.length === 0) return answer("ask", "Deletion target is unclear")
      const recursive = options.some((option) => /^-[A-Za-z]*[rR]/.test(option) || option === "--recursive")
      for (const target of targets) {
        const checked = checkPath(target, event.cwd, root)
        if (checked.decision !== "allow") return checked
        const path = targetPath(target, event.cwd)
        if (path === root || inside(root, path)) return answer("deny", "Cannot delete worktree root or ancestor")
      }
      return answer("ask", recursive ? "Recursive deletion requires approval" : "Deletion requires approval")
    }
    if (executable === "git" && words.slice(1).some((word) => /^(push|commit|reset|clean|checkout|switch|branch|tag|rebase|merge)$/.test(word))) {
      return answer("ask", "Git mutation requires approval")
    }
    if (executable === "git" && words.some((word) => word.startsWith("--git-dir=") || word === "-C")) return answer("ask", "Git context change requires review")
    if (executable === "gh" && !/^(status|auth|repo|pr|issue)$/.test(words[1] ?? "")) return answer("ask", "GitHub command requires review")
    if (executable === "gh" && /\b(create|merge|close|edit|delete|comment|review|release|publish)\b/.test(command)) return answer("ask", "GitHub mutation requires approval")
    if (/\b(?:deploy|publish)\b/i.test(command)) return answer("ask", "Publishing requires approval")
    if (/^(?:vite|watch)$/.test(executable) || (executable === "tail" && words.includes("-f")) || /^(?:npm|pnpm|yarn|bun)$/.test(executable) && words.includes("dev") || executable === "next" && words.includes("dev") || executable === "sleep" && Number(words[1]) > 60) {
      return answer("ask", "Long-running foreground command; use a bounded or background command")
    }
    return answer("allow", "No policy restriction")
  } catch {
    return answer("deny", "Policy could not verify this operation")
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let input = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) input += chunk
  let result
  try {
    result = decide(JSON.parse(input))
  } catch {
    result = answer("deny", "Invalid hook JSON")
  }
  if (result.decision !== "allow") {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: result.decision, permissionDecisionReason: result.reason } }) + "\n")
  }
}
