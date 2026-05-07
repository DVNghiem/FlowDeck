import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

const root = process.cwd()
const skillsDir = join(root, "src", "skills")

const requiredFrontmatterKeys = ["name", "description", "origin"]
const sectionPattern = /^##\s+/m

function collectSkillFiles(dir) {
  const entries = readdirSync(dir)
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      files.push(...collectSkillFiles(full))
      continue
    }
    if (entry === "SKILL.md") files.push(full)
  }
  return files
}

const failures = []

for (const file of collectSkillFiles(skillsDir)) {
  const raw = readFileSync(file, "utf-8")
  const rel = file.replace(`${root}/`, "")
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) {
    failures.push(`${rel}: missing YAML frontmatter`)
    continue
  }

  const frontmatter = fmMatch[1]
  for (const key of requiredFrontmatterKeys) {
    if (!new RegExp(`^${key}:\\s*.+$`, "m").test(frontmatter)) {
      failures.push(`${rel}: missing frontmatter key "${key}"`)
    }
  }

  if (!sectionPattern.test(raw)) {
    failures.push(`${rel}: missing markdown sections (expected at least one level-2 heading)`)
  }
}

if (failures.length > 0) {
  console.error("Skill validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Skill validation passed.")
