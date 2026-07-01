import { readdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"

const root = process.cwd()
const commandsDir = join(root, "src", "commands")
const skillsDir = join(root, "src", "skills")
const docsToCheck = [
  "README.md",
  "docs/index.md",
  "docs/concepts/workflows.md",
  "docs/concepts/intelligence.md",
  "docs/concepts/architecture.md",
  "docs/concepts/governance.md",
]

const commandFiles = readdirSync(commandsDir).filter((file) => file.endsWith(".md"))
const commandSet = new Set(commandFiles.map((file) => `/${file.replace(".md", "")}`))
const commandPattern = /\/fd-[a-z0-9-]+/g

function countSkills() {
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  return dirs.length
}

const failures = []

for (const relPath of docsToCheck) {
  const fullPath = join(root, relPath)
  if (!existsSync(fullPath)) {
    failures.push(`${relPath}: file does not exist`)
    continue
  }
  const content = readFileSync(fullPath, "utf-8")
  const matches = content.match(commandPattern) ?? []
  for (const command of matches) {
    if (!commandSet.has(command)) {
      failures.push(`${relPath}: references missing command ${command}`)
    }
  }
}

// Verify skill count in README and docs/index.md
const docsWithSkillCount = ["README.md", "docs/index.md"]
for (const relPath of docsWithSkillCount) {
  const fullPath = join(root, relPath)
  if (!existsSync(fullPath)) continue
  const content = readFileSync(fullPath, "utf-8")
  const skillCountMatch = content.match(/\*\*(\d+)\s+skills\*\*/i)
  if (!skillCountMatch) {
    failures.push(`${relPath}: missing skills count badge line`)
  } else {
    const declared = Number(skillCountMatch[1])
    const actual = countSkills()
    if (declared !== actual) {
      failures.push(`${relPath}: declares ${declared} skills but src/skills has ${actual}`)
    }
  }
}

// Verify command count in docs/index.md
const indexPath = join(root, "docs/index.md")
if (existsSync(indexPath)) {
  const indexContent = readFileSync(indexPath, "utf-8")
  const commandCountMatch = indexContent.match(/\*\*(\d+)\s+commands\*\*/i)
  if (!commandCountMatch) {
    failures.push("docs/index.md: missing commands count badge line")
  } else {
    const declared = Number(commandCountMatch[1])
    const actual = commandFiles.length
    if (declared !== actual) {
      failures.push(`docs/index.md: declares ${declared} commands but src/commands has ${actual}`)
    }
  }
}

if (failures.length > 0) {
  console.error("Docs validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Docs validation passed.")
