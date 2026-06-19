import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

const root = process.cwd()
const skillsDir = join(root, "src", "skills")

const requiredFrontmatterKeys = ["name", "description", "origin"]
const sectionPattern = /^##\s+/m
// Description word-count budget: warn at WARN, fail at FAIL.
const DESCRIPTION_WARN_WORDS = 22
const DESCRIPTION_FAIL_WORDS = 30
// SKILL.md body line-count budget: warn at WARN, fail at FAIL.
// Tuned above the current maximum legitimate reference skill (~535 lines for
// python-patterns) so the gate catches future bloat without blocking the
// existing reference set.
const BODY_WARN_LINES = 500
const BODY_FAIL_LINES = 600

function countWords(s) {
  return s.trim().split(/\s+/).filter(Boolean).length
}

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
const warnings = []

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

  // Token-budget gate: description word count.
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (descMatch) {
    const words = countWords(descMatch[1])
    if (words > DESCRIPTION_FAIL_WORDS) {
      failures.push(`${rel}: description has ${words} words (max ${DESCRIPTION_FAIL_WORDS})`)
    } else if (words > DESCRIPTION_WARN_WORDS) {
      warnings.push(`${rel}: description has ${words} words (target ≤${DESCRIPTION_WARN_WORDS})`)
    }
  }

  // Token-budget gate: SKILL.md body line count.
  const lines = raw.split("\n").length
  if (lines > BODY_FAIL_LINES) {
    failures.push(`${rel}: SKILL.md has ${lines} lines (max ${BODY_FAIL_LINES})`)
  } else if (lines > BODY_WARN_LINES) {
    warnings.push(`${rel}: SKILL.md has ${lines} lines (target ≤${BODY_WARN_LINES})`)
  }
}

if (warnings.length > 0) {
  console.warn("Skill validation warnings:")
  for (const w of warnings) console.warn(`- ${w}`)
}

if (failures.length > 0) {
  console.error("Skill validation failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Skill validation passed.")
