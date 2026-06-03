import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import { mergeAssistTool } from "@/tools/merge-assist"
import { spawnSync } from "child_process"

const TMP = join(process.cwd(), ".test-tmp-merge-assist")

function makeCtx() {
  return {
    directory: TMP,
    sessionID: "test",
    messageID: "test",
    agent: "test",
    worktree: TMP,
    abort: new AbortController().signal,
  } as any
}

function git(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("git", args, { cwd: TMP, encoding: "utf-8" })
  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    status: result.status ?? null,
  }
}

function setupRepo() {
  git(["init"])
  git(["config", "user.email", "test@test.com"])
  git(["config", "user.name", "Test User"])

  // Rename default branch to main (handles both master and main defaults)
  git(["branch", "-m", "main"])

  // Create main branch with initial commit
  writeFileSync(join(TMP, "main.txt"), "main content", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "initial commit"])

  // Create feature branch with commits
  git(["checkout", "-b", "feature/oauth"])
  writeFileSync(join(TMP, "oauth.ts"), "oauth code", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "feat(auth): add OAuth flow"])

  writeFileSync(join(TMP, "auth.ts"), "auth refactor", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "refactor(auth): extract auth module"])

  // Go back to main
  git(["checkout", "main"])
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
  setupRepo()
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe("merge-assist tool", () => {
  it("start creates a session and returns it", async () => {
    const result = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.session.targetBranch).toBe("main")
    expect(result.session.sourceBranch).toBe("feature/oauth")
    expect(result.session.featureDescription).toBe("OAuth login")
    expect(result.session.status).toBe("clarifying")
    expect(result.session.confirmations.length).toBe(1)
    expect(result.session.confirmations[0].step).toBe("branch_selection")
  })

  it("start fails when target branch does not exist", async () => {
    const result = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "nonexistent",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    expect(result.error).toMatch(/Target branch 'nonexistent' does not exist/)
  })

  it("start fails when source branch does not exist", async () => {
    const result = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "nonexistent",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    expect(result.error).toMatch(/Source branch 'nonexistent' does not exist/)
  })

  it("inspect finds candidate commits", async () => {
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
    expect(result.session.status).toBe("inspecting")
    expect(result.session.confirmations.some((c: any) => c.step === "commit_selection")).toBe(true)
  })

  it("plan builds a merge plan", async () => {
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    const inspect = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    const shas = inspect.candidates.map((c: any) => c.sha)

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
      selectedCommits: shas,
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.plan).toBeDefined()
    expect(result.plan.selectedCommits.length).toBe(shas.length)
    expect(result.plan.dryRun).toBe(true)
    expect(result.plan.recommendedCommands.length).toBeGreaterThan(0)
    expect(result.session.status).toBe("planning")
  })

  it("confirm records approval and advances status", async () => {
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    const confirm = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "branch_selection",
      approved: true,
    }, makeCtx()) as string)

    expect(confirm.success).toBe(true)
    expect(confirm.approved).toBe(true)
    expect(confirm.session.status).toBe("inspecting")
    expect(confirm.session.confirmations[0].status).toBe("approved")
  })

  it("abort sets status to aborted", async () => {
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "abort",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.session.status).toBe("aborted")
  })

  it("status returns current session", async () => {
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "status",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.session.id).toBe(start.session.id)
  })

  it("list returns all sessions", async () => {
    await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx())

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "list",
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it("plan without selectedCommits returns error", async () => {
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(result.error).toMatch(/selectedCommits required/)
  })

  it("returns error for non-git repo", async () => {
    const nonGitTmp = join(process.cwd(), ".test-tmp-not-git")
    if (existsSync(nonGitTmp)) rmSync(nonGitTmp, { recursive: true })
    mkdirSync(nonGitTmp, { recursive: true })

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "list",
    }, {
      directory: nonGitTmp,
      sessionID: "test",
      messageID: "test",
      agent: "test",
      worktree: nonGitTmp,
      abort: new AbortController().signal,
    } as any) as string)

    expect(result.error).toBe("Not a git repository")

    rmSync(nonGitTmp, { recursive: true })
  })
})
