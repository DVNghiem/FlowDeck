import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { basename, join } from "path"
import type { ToolContext } from "@opencode-ai/plugin"
import { captureLessonTool, reviewLessonsTool } from "@/tools/capture-lesson"

// Isolated per-run cwd whose basename acts as the project tag for entries.
const TMP = join(process.cwd(), ".test-tmp-lessons")
const PROJECT = basename(TMP)
const LESSONS_FILE = join(TMP, "lessons.md")

function makeCtx(directory: string = TMP): ToolContext {
  return {
    directory,
    sessionID: "test",
    messageID: "test",
    agent: "test",
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
  // Point the tool at the per-run temp file so tests never touch the real global file.
  process.env.FLOWDECK_LESSONS_FILE = LESSONS_FILE
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  delete process.env.FLOWDECK_LESSONS_FILE
})

describe("capture-lesson tool", () => {
  it("appends an entry to the global lessons file with a project tag", async () => {
    const result = await captureLessonTool.execute(
      {
        context: "typecheck loop",
        mistake: "Ignored tsconfig skipLibCheck side effect.",
        lesson: "Always run tsc --noEmit after changing tsconfig.",
        severity: "high",
      },
      makeCtx(),
    )

    expect(result).toContain(LESSONS_FILE)
    expect(existsSync(LESSONS_FILE)).toBe(true)

    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toContain("typecheck loop")
    expect(review).toContain("Always run tsc --noEmit")
    expect(review).toContain("**Severity:** high")
    expect(review).toContain(`**Project:** ${PROJECT}`)
  })

  it("returns the current project's lessons when no keywords are provided", async () => {
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

  it("scopes by project when no keywords are provided", async () => {
    // Write entries tagged for a different project directly into the global file.
    const otherEntry = `## 2026-01-01 — other project entry\n**Severity:** low\n**Project:** some-other-project\n**Mistake:** X\n**Lesson:** Y\n\n`
    writeFileSync(LESSONS_FILE, otherEntry, "utf-8")

    await captureLessonTool.execute(
      { context: "current project entry", mistake: "Mistake", lesson: "Lesson" },
      makeCtx(),
    )

    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toContain("current project entry")
    expect(review).not.toContain("other project entry")
  })

  it("filters sections by keywords across all projects", async () => {
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
    const largeSection = `## 2024-01-01 — old\n**Severity:** medium\n**Project:** ${PROJECT}\n**Mistake:** ${"x".repeat(2000)}\n**Lesson:** ${"y".repeat(2000)}\n\n`
    const sections: string[] = []
    while (Buffer.byteLength(sections.join(""), "utf-8") <= 110 * 1024) {
      sections.push(largeSection)
    }
    writeFileSync(LESSONS_FILE, sections.join(""), "utf-8")

    const result = await captureLessonTool.execute(
      { context: "new lesson", mistake: "Mistake", lesson: "Lesson" },
      makeCtx(),
    )
    expect(result).toContain(LESSONS_FILE)

    const review = await reviewLessonsTool.execute({}, makeCtx())
    expect(review).toContain("new lesson")
  })

  it("migrates a legacy per-project .flowdeck/lessons.md into the global file on first read", async () => {
    const legacyDir = join(TMP, "subdir")
    mkdirSync(join(legacyDir, ".flowdeck"), { recursive: true })
    const legacyEntry = `## 2024-01-01 — legacy entry\n**Severity:** medium\n**Mistake:** old mistake\n**Lesson:** old lesson\n\n`
    writeFileSync(join(legacyDir, ".flowdeck", "lessons.md"), legacyEntry, "utf-8")

    // Global file absent before the call.
    expect(existsSync(LESSONS_FILE)).toBe(false)

    const review = await reviewLessonsTool.execute({}, makeCtx(legacyDir))
    expect(review).toContain("legacy entry")
    expect(existsSync(LESSONS_FILE)).toBe(true)
    // The migrated entry carries the project tag derived from the legacy cwd.
    expect(review).toContain(`**Project:** ${basename(legacyDir)}`)
    // The legacy per-project file is left untouched as a backup.
    expect(existsSync(join(legacyDir, ".flowdeck", "lessons.md"))).toBe(true)
  })

  it("searches across projects when keywords are provided", async () => {
    // Seed the global file with an entry tagged for a different project.
    const otherEntry = `## 2026-01-01 — other migration story\n**Severity:** low\n**Project:** some-other-project\n**Mistake:** X\n**Lesson:** Y\n\n`
    writeFileSync(LESSONS_FILE, otherEntry, "utf-8")

    await captureLessonTool.execute(
      { context: "current migration story", mistake: "Mistake", lesson: "Lesson" },
      makeCtx(),
    )

    // Default scope excludes the other project.
    const scoped = await reviewLessonsTool.execute({}, makeCtx())
    expect(scoped).toContain("current migration story")
    expect(scoped).not.toContain("other migration story")

    // Keywords override the project filter.
    const searched = await reviewLessonsTool.execute({ keywords: ["migration"] }, makeCtx())
    expect(searched).toContain("current migration story")
    expect(searched).toContain("other migration story")
  })
})
