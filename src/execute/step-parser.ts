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

  let match: RegExpExecArray | null
  while ((match = stepRegex.exec(planContent)) !== null) {
    const startIndex = match.index
    const nextMatchIndex = getNextMatchIndex(planContent, stepRegex, startIndex)
    const section = planContent.slice(startIndex, nextMatchIndex)

    steps.push(parseStep(section))
  }

  return steps
}

function getNextMatchIndex(content: string, regex: RegExp, fromIndex: number): number {
  const next = regex.exec(content)
  regex.lastIndex = 0
  if (next && next.index > fromIndex) {
    return next.index
  }
  return content.length
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

function parseBlock(section: string, label: string): string {
  const regex = new RegExp(`${label}\\s*(.+?)(?=\\n\\n|\\n##|\\n###|\\*\\*|$)`, "s")
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
  const tddMatch = section.match(/\*\*TDD:\*\*([\s\S]*?)(?=\n\n|\n##|\n###|\*\*|$)/)
  if (!tddMatch) return result

  const tddText = tddMatch[1]
  result.test = tddText.match(/-?\s*Test:\s*(.+)/)?.[1]?.trim() || ""
  result.verify = tddText.match(/-?\s*Verify:\s*(.+)/)?.[1]?.trim() || ""
  result.implement = tddText.match(/-?\s*Implement:\s*(.+)/)?.[1]?.trim() || ""

  return result
}

function validateCoder(coder: string): PlanStep["coder"] {
  if (coder === "backend-coder" || coder === "frontend-coder" || coder === "devops-coder") {
    return coder
  }
  return "backend-coder"
}
