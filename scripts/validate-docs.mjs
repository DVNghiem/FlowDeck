import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const root = process.cwd()
const commandsDir = join(root, "src", "commands")
const skillsDir = join(root, "src", "skills")
const docsToCheck = [
  "README.md",
  "docs/commands.md",
  "docs/workflows.md",
  "docs/intelligence.md",
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
  const content = readFileSync(fullPath, "utf-8")
  const matches = content.match(commandPattern) ?? []
  for (const command of matches) {
    if (!commandSet.has(command)) {
      failures.push(`${relPath}: references missing command ${command}`)
    }
  }
}

const readme = readFileSync(join(root, "README.md"), "utf-8")
const skillCountMatch = readme.match(/\*\*(\d+)\s+skills\*\*/i)
if (!skillCountMatch) {
  failures.push("README.md: missing skills count badge line")
} else {
  const declared = Number(skillCountMatch[1])
  const actual = countSkills()
  if (declared !== actual) {
    failures.push(`README.md: declares ${declared} skills but src/skills has ${actual}`)
  }
}

if (failures.length > 0) {
  console.error("Docs validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Docs validation passed.")
