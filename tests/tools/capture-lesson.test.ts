import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import type { ToolContext } from "@opencode-ai/plugin"
import { captureLessonTool, reviewLessonsTool } from "@/tools/capture-lesson"

const TMP = join(process.cwd(), ".test-tmp-lessons")

function makeCtx(): ToolContext {
  return {
    directory: TMP,
    sessionID: "test",
    messageID: "test",
    agent: "test",
    worktree: TMP,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe("capture-lesson tool", () => {
  it("appends an entry to .flowdeck/lessons.md", async () => {
    const result = await captureLessonTool.execute(
      {
        context: "typecheck loop",
        mistake: "Ignored tsconfig skipLibCheck side effect.",
        lesson: "Always run tsc --noEmit after changing tsconfig.",
        severity: "high",
      },
      makeCtx(),
    )

    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toContain("typecheck loop")
    expect(review).toContain("Always run tsc --noEmit")
    expect(review).toContain("**Severity:** high")
  })

  it("returns the full file when no keywords are provided", async () => {
    await captureLessonTool.execute(
      { context: "migration", mistake: "Mistake A", lesson: "Lesson A" },
      makeCtx(),
    )
    await captureLessonTool.execute(
      { context: "ui layout", mistake: "Mistake B", lesson: "Lesson B" },
      makeCtx(),
    )

    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toContain("migration")
    expect(review).toContain("ui layout")
  })

  it("filters sections by keywords", async () => {
    await captureLessonTool.execute(
      { context: "migration", mistake: "Mistake A", lesson: "Lesson A" },
      makeCtx(),
    )
    await captureLessonTool.execute(
      { context: "ui layout", mistake: "Mistake B", lesson: "Lesson B" },
      makeCtx(),
    )

    const review = await reviewLessonsTool.execute({ keywords: ["migration"] }, makeCtx())
    expect(review).toContain("migration")
    expect(review).not.toContain("ui layout")
  })

  it("returns a friendly message when the lessons file is missing", async () => {
    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toBe("No lessons captured yet.")
  })

  it("rejects empty required fields", async () => {
    const result = await captureLessonTool.execute(
      { context: "", mistake: " ", lesson: "valid" },
      makeCtx(),
    )
    expect(result).toContain("Error:")
    expect(result).toContain("context")
    expect(result).toContain("mistake")
  })

  it("rejects fields exceeding the max length", async () => {
    const longString = "x".repeat(2001)
    const result = await captureLessonTool.execute(
      { context: longString, mistake: "valid", lesson: "valid" },
      makeCtx(),
    )
    expect(result).toContain("Error:")
    expect(result).toContain("2000")
  })

  it("truncates the oldest lessons when the file exceeds the size cap", async () => {
    const dir = join(TMP, ".flowdeck")
    mkdirSync(dir, { recursive: true })
    // Create a file just over the 100 KB cap by repeating a large lesson section.
    const largeSection = `## 2024-01-01 — old\n**Severity:** medium\n**Mistake:** ${"x".repeat(2000)}\n**Lesson:** ${"y".repeat(2000)}\n\n`
    const sections: string[] = []
    while (Buffer.byteLength(sections.join(""), "utf-8") <= 110 * 1024) {
      sections.push(largeSection)
    }
    writeFileSync(join(TMP, ".flowdeck", "lessons.md"), sections.join(""), "utf-8")

    const result = await captureLessonTool.execute(
      { context: "new lesson", mistake: "Mistake", lesson: "Lesson" },
      makeCtx(),
    )
    expect(result).toContain("Lesson captured in .flowdeck/lessons.md")

    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toContain("new lesson")
  })
})
