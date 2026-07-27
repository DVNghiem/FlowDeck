import { readdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"

const rootArg = process.argv.find((a) => a.startsWith("--root="))
const root = rootArg ? rootArg.slice("--root=".length) : process.cwd()

const commandsDir = join(root, "src", "commands")
const skillsDir = join(root, "src", "skills")
const docsCommandsDir = join(root, "docs", "commands")
const mkdocsPath = join(root, "mkdocs.yml")
const versionPath = join(root, "VERSION")
const packagePath = join(root, "package.json")
const agentsIndexPath = join(root, "src", "agents", "index.ts")

const rootDocs = ["README.md", "docs/index.md", "mkdocs.yml"]
const commandDocFiles = existsSync(commandsDir)
  ? readdirSync(commandsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `docs/commands/${f}`)
  : []
const commandDocs = commandDocFiles

const docsToCheck = [...rootDocs, ...commandDocs]

const commandFiles = readdirSync(commandsDir).filter((file) => file.endsWith(".md"))
const commandSet = new Set(commandFiles.map((file) => `/${file.replace(".md", "")}`))
const commandPattern = /\/fd-[a-z0-9-]+/g

function countSkills() {
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  return dirs.length
}

function countAgents() {
  if (!existsSync(agentsIndexPath)) return 0
  const src = readFileSync(agentsIndexPath, "utf-8")
  const matches = src.match(/^  '[a-z][a-z-]+',?$/gm) ?? []
  return matches.length
}

const failures = []

function pushFailure(msg) {
  failures.push(msg)
}

function assertCount({ relPath, label, actual, pattern }) {
  const fullPath = join(root, relPath)
  if (!existsSync(fullPath)) return
  const content = readFileSync(fullPath, "utf-8")
  const match = content.match(pattern)
  if (!match) {
    pushFailure(`${relPath}: missing ${label} count badge line`)
    return
  }
  const declared = Number(match[1])
  if (declared !== actual) {
    pushFailure(`${relPath}: declares ${declared} ${label} but src/${label} has ${actual}`)
  }
}

// Scan shipped-command set only across README.md, docs/index.md, mkdocs.yml, and docs/commands/*.md
for (const relPath of docsToCheck) {
  const fullPath = join(root, relPath)
  if (!existsSync(fullPath)) {
    pushFailure(`${relPath}: file does not exist`)
    continue
  }
  const content = readFileSync(fullPath, "utf-8")
  const matches = content.match(commandPattern) ?? []
  for (const command of matches) {
    if (!commandSet.has(command)) {
      pushFailure(`${relPath}: references missing command ${command}`)
    }
  }
}

// Skill count in README.md and docs/index.md
for (const relPath of ["README.md", "docs/index.md"]) {
  assertCount({
    relPath,
    label: "skills",
    actual: countSkills(),
    pattern: /\*\*(\d+)\s+skills\*\*/i,
  })
}

// Command count in docs/index.md
assertCount({
  relPath: "docs/index.md",
  label: "commands",
  actual: commandFiles.length,
  pattern: /\*\*(\d+)\s+commands\*\*/i,
})

// Agent count in README.md and docs/index.md
const agentCount = countAgents()
for (const relPath of ["README.md", "docs/index.md"]) {
  assertCount({
    relPath,
    label: "agents",
    actual: agentCount,
    pattern: /\*\*(\d+)\s+agents\*\*/i,
  })
}

// Command-directory parity check: src/commands/ filenames should match docs/commands/ filenames
if (existsSync(commandsDir) && existsSync(docsCommandsDir)) {
  const srcSet = new Set(commandFiles)
  const docsActual = readdirSync(docsCommandsDir).filter((f) => f.endsWith(".md"))
  const docsSet = new Set(docsActual)
  const missing = [...srcSet].filter((f) => !docsSet.has(f))
  const extra = [...docsSet].filter((f) => !srcSet.has(f))
  if (missing.length || extra.length) {
    const parts = []
    if (missing.length) parts.push(`docs/commands missing: ${missing.join(", ")}`)
    if (extra.length) parts.push(`docs/commands extra: ${extra.join(", ")}`)
    pushFailure(`command-directory parity mismatch: ${parts.join("; ")}`)
  }
}

// Version-parity assertion: VERSION must equal package.json.version
if (existsSync(versionPath) && existsSync(packagePath)) {
  const versionRaw = readFileSync(versionPath, "utf-8").trim()
  const pkg = JSON.parse(readFileSync(packagePath, "utf-8"))
  const pkgVersion = pkg.version
  if (versionRaw !== pkgVersion) {
    pushFailure(`VERSION is ${versionRaw} but package.json.version is ${pkgVersion}`)
  }
}

// Relative-link check on README.md, docs/index.md, active docs/commands/*.md, mkdocs.yml
const linkTargetsToCheck = [
  ...commandDocs.filter((p) => existsSync(join(root, p))),
  ...rootDocs.filter((p) => existsSync(join(root, p))),
]

const RELATIVE_LINK_RE = /(?:\[[^\]]*\]\()([^\)]+)(\))/g

function resolveFile(relFrom, target) {
  if (/^[a-z]+:\/\//i.test(target)) return null
  if (target.startsWith("#")) return null
  if (target.startsWith("mailto:")) return null
  if (target.startsWith("/")) return join(root, target.replace(/^\/+/, ""))
  const base = relFrom.includes("/")
    ? join(root, relFrom.split("/").slice(0, -1).join("/"))
    : root
  return join(base, target)
}

for (const relPath of linkTargetsToCheck) {
  const fullPath = join(root, relPath)
  if (!existsSync(fullPath)) continue
  const content = readFileSync(fullPath, "utf-8")
  const matches = [...content.matchAll(RELATIVE_LINK_RE)]
  for (const m of matches) {
    const target = m[1].split("#")[0].split("?")[0]
    if (!target) continue
    const resolved = resolveFile(relPath, target)
    if (resolved === null) continue
    if (!existsSync(resolved)) {
      pushFailure(`${relPath}: broken relative link ${target}`)
    }
  }
}

// Drift guard: ban legacy planning paths and deprecated interfaces from docs.
// Runtime uses `~/.fd-plan/<slug>/` and MCP `codegraph_*` tools. Drift here
// means a doc still describes the old system. `.codebase/` references are
// allowed only under `~/.fd-plan/<slug>/.codebase/` — the canonical location.
const DRIFT_PATTERNS = [
  { regex: /\.planning\//, label: ".planning/ (legacy planning dir)" },
  { regex: /PLAN\.md/, label: "PLAN.md (uppercase; use lowercase plan.md)" },
  { regex: /DISCUSS\.md/, label: "DISCUSS.md (legacy discussion artifact)" },
  { regex: /CHECKPOINT\.md/, label: "CHECKPOINT.md (legacy per-phase file)" },
  { regex: /ROADMAP\.md/, label: "ROADMAP.md (legacy roadmap file)" },
  { regex: /codegraph action=/, label: "codegraph action= (deprecated CLI; use MCP codegraph_* tools)" },
  { regex: /--phase=/, label: "--phase= (legacy flag; use --topic=)" },
  { regex: /phase-<N>/, label: "phase-<N> (legacy dir pattern; use wave-<N>)" },
  // `.codebase/` is only valid under `~/.fd-plan/<slug>/.codebase/`. Bare
  // references mean docs describe the old per-repo storage location.
  { regex: /(?<!~?\/.fd-plan\/<slug>\/)\.codebase\//, label: ".codebase/ outside canonical ~/.fd-plan/<slug>/.codebase/ location" },
]

// Files where these patterns legitimately appear. CHANGELOG.md may reference
// removed features. docs/agents/ describes agent contracts that reference the
// legacy `.codebase/` paths runtime still uses.
const DRIFT_ALLOWLIST = new Set([
  "CHANGELOG.md",
  "docs/agents/domain.md",
  "docs/agents/issue-tracker.md",
  "docs/agents/triage-labels.md",
])

const DRIFT_SCAN_DIRS = [
  "docs/commands",
  "docs/concepts",
  "docs/getting-started",
  "docs/reference",
  "docs/skills",
  "docs/configuration",
]
const DRIFT_SCAN_ROOT_FILES = ["README.md", "AGENTS.md", "CLAUDE.md"]
const DRIFT_SCAN_DOC_FILES = ["docs/index.md"]

function driftScanFiles() {
  const out = []
  for (const dir of DRIFT_SCAN_DIRS) {
    const fullPath = join(root, dir)
    if (!existsSync(fullPath)) continue
    for (const entry of readdirSync(fullPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      const rel = `${dir}/${entry.name}`
      if (DRIFT_ALLOWLIST.has(rel)) continue
      out.push(rel)
    }
  }
  for (const f of DRIFT_SCAN_DOC_FILES) {
    if (existsSync(join(root, f)) && !DRIFT_ALLOWLIST.has(f)) out.push(f)
  }
  for (const f of DRIFT_SCAN_ROOT_FILES) {
    if (existsSync(join(root, f)) && !DRIFT_ALLOWLIST.has(f)) out.push(f)
  }
  return out
}

for (const relPath of driftScanFiles()) {
  const fullPath = join(root, relPath)
  const content = readFileSync(fullPath, "utf-8")
  for (const { regex, label } of DRIFT_PATTERNS) {
    if (regex.test(content)) {
      pushFailure(`${relPath}: contains legacy pattern (${label})`)
    }
  }
}

if (failures.length > 0) {
  console.error("Docs validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Docs validation passed.")
