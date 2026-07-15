export interface PlanStep {
  title: string
  files: string[]
  what: string
  tdd: {
    test: string
    verify: string
    implement: string
  }
  doneWhen: string
  coder: "backend-coder" | "frontend-coder" | "devops-coder"
}

/** Parse a plan.md file into a list of PlanStep objects */
export function parsePlanSteps(planContent: string): PlanStep[] {
  const steps: PlanStep[] = []
  const stepRegex = /^###\s+Step\s+(\d+):\s*(.+)$/gm

  const matches = Array.from(planContent.matchAll(stepRegex))

  for (let i = 0; i < matches.length; i++) {
    const startIndex = matches[i].index!
    const endIndex = i + 1 < matches.length ? matches[i + 1].index! : planContent.length
    const section = planContent.slice(startIndex, endIndex)
    steps.push(parseStep(section))
  }

  return steps
}

function parseStep(section: string): PlanStep {
  const title = section.match(/^###\s+Step\s+\d+:\s*(.+)$/m)?.[1]?.trim() || ""
  const files = parseList(section, "**Files:**")
  const what = parseBlock(section, "**What:**")
  const doneWhen = parseBlock(section, "**Done when:**")
  const coder = parseBlock(section, "**Coder:**") as PlanStep["coder"]

  const tddSection = extractTddSection(section)

  return {
    title,
    files,
    what,
    tdd: {
      test: tddSection.test || "",
      verify: tddSection.verify || "",
      implement: tddSection.implement || "",
    },
    doneWhen,
    coder: validateCoder(coder),
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseBlock(section: string, label: string): string {
  const escaped = escapeRegex(label)
  const regex = new RegExp(`${escaped}\\s*(.+?)(?=\\n\\n|\\n##|\\n###|\\n\\*\\*|$)`, "s")
  const match = section.match(regex)
  return match?.[1]?.trim() || ""
}

function parseList(section: string, label: string): string[] {
  const block = parseBlock(section, label)
  if (!block) return []
  return block
    .split(",")
    .map(f => f.trim())
    .filter(Boolean)
}

function extractTddSection(section: string): { test: string; verify: string; implement: string } {
  const result = { test: "", verify: "", implement: "" }
  const tddMatch = section.match(/\*\*TDD:\*\*([\s\S]*?)(?=\n\n|\n##|\n###|$)/)
  if (!tddMatch) return result

  const tddText = tddMatch[1]
  result.test = tddText.match(/-?\s*Test:\s*(.+)/)?.[1]?.trim() || ""
  result.verify = tddText.match(/-?\s*Verify:\s*(.+)/)?.[1]?.trim() || ""
  result.implement = tddText.match(/-?\s*Implement:\s*(.+)/)?.[1]?.trim() || ""

  return result
}

/**
 * Throws if `coder` is not one of the known agent types. Returning a default
 * (e.g. always "backend-coder") would silently dispatch the wrong agent — a
 * trust-boundary violation: the parser promises to parse but actually defaults.
 * Surface the error so the planner gets retried with feedback instead.
 */
function validateCoder(coder: string): PlanStep["coder"] {
  if (coder === "backend-coder" || coder === "frontend-coder" || coder === "devops-coder") {
    return coder
  }
  throw new Error(
    `Invalid **Coder:** value "${coder}". Must be one of: backend-coder, frontend-coder, devops-coder.`
  )
}
