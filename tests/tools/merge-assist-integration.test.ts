import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { mergeAssistTool } from "@/tools/merge-assist"
import { spawnSync } from "child_process"
import { logRead } from "@/lib/logger"

const TMP = join(process.cwd(), "tests/tools/.test-tmp-merge-assist-integration")

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

function setupCleanRepo() {
  git(["init"])
  git(["config", "user.email", "test@test.com"])
  git(["config", "user.name", "Test User"])
  git(["branch", "-m", "main"])

  writeFileSync(join(TMP, "main.txt"), "main content", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "initial commit"])

  git(["checkout", "-b", "feature/oauth"])
  writeFileSync(join(TMP, "oauth.ts"), "oauth code", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "feat(auth): add OAuth flow"])

  writeFileSync(join(TMP, "auth.ts"), "auth refactor", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "refactor(auth): extract auth module"])

  git(["checkout", "main"])
}

function setupConflictingRepo() {
  git(["init"])
  git(["config", "user.email", "test@test.com"])
  git(["config", "user.name", "Test User"])
  git(["branch", "-m", "main"])

  writeFileSync(join(TMP, "shared.txt"), "original content", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "initial commit"])

  git(["checkout", "-b", "feature/conflict"])
  writeFileSync(join(TMP, "shared.txt"), "feature line 1", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "feat: first change to shared"])

  writeFileSync(join(TMP, "shared.txt"), "feature line 2", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "feat: second change to shared"])

  git(["checkout", "main"])
  writeFileSync(join(TMP, "shared.txt"), "main changed this", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "fix: main changed shared"])
}

function setupRepoWithDependency() {
  git(["init"])
  git(["config", "user.email", "test@test.com"])
  git(["config", "user.name", "Test User"])
  git(["branch", "-m", "main"])

  writeFileSync(join(TMP, "main.txt"), "main content", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "initial commit"])

  git(["checkout", "-b", "feature/complex"])

  writeFileSync(join(TMP, "lib.ts"), "refactored lib", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "refactor(lib): extract shared utilities"])

  writeFileSync(join(TMP, "feature.ts"), "feature using lib", "utf-8")
  git(["add", "."])
  git(["commit", "-m", "feat(feature): add new capability"])

  git(["checkout", "main"])
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe("merge-assist integration tests", () => {
  it("full happy path workflow — start → inspect → plan → confirm branch → confirm commits → confirm plan → execute gate → complete", async () => {
    setupCleanRepo()

    // start
    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    expect(start.success).toBe(true)
    expect(start.session.status).toBe("clarifying")
    expect(start.session.confirmations.some((c: any) => c.step === "branch_selection")).toBe(true)

    // confirm branch
    const confirmBranch = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "branch_selection",
      approved: true,
    }, makeCtx()) as string)

    expect(confirmBranch.approved).toBe(true)
    expect(confirmBranch.session.status).toBe("inspecting")

    // inspect
    const inspect = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(inspect.success).toBe(true)
    expect(inspect.candidates.length).toBeGreaterThanOrEqual(1)
    expect(inspect.session.confirmations.some((c: any) => c.step === "commit_selection")).toBe(true)

    // confirm commits
    const confirmCommits = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "commit_selection",
      approved: true,
    }, makeCtx()) as string)

    expect(confirmCommits.approved).toBe(true)
    expect(confirmCommits.session.status).toBe("planning")

    // plan
    const shas = inspect.candidates.map((c: any) => c.sha)
    const plan = JSON.parse(await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
      selectedCommits: shas,
    }, makeCtx()) as string)

    expect(plan.success).toBe(true)
    expect(plan.plan.dryRun).toBe(true)
    expect(plan.plan.recommendedCommands.length).toBeGreaterThan(0)
    expect(plan.session.status).toBe("planning")

    // confirm plan steps
    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "integration_branch",
      approved: true,
    }, makeCtx())

    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "method_selection",
      approved: true,
    }, makeCtx())

    const confirmPlan = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "dependency_inclusion",
      approved: true,
    }, makeCtx()) as string)

    expect(confirmPlan.session.status).toBe("awaiting_confirmation")
    expect(confirmPlan.session.confirmations.some((c: any) => c.step === "execute_plan")).toBe(true)

    // confirm execute
    const confirmExecute = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "execute_plan",
      approved: true,
    }, makeCtx()) as string)

    expect(confirmExecute.session.status).toBe("executing")
    expect(confirmExecute.session.confirmations.some((c: any) => c.step === "push_pr")).toBe(true)

    // confirm push/pr
    const confirmPush = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "push_pr",
      approved: true,
    }, makeCtx()) as string)

    expect(confirmPush.session.status).toBe("completed")
  })

  it("creates branch_selection confirmation on start", async () => {
    setupCleanRepo()

    const result = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    expect(result.success).toBe(true)
    expect(result.session.confirmations.length).toBe(1)
    expect(result.session.confirmations[0].step).toBe("branch_selection")
    expect(result.session.confirmations[0].status).toBe("pending")
    expect(result.session.confirmations[0].prompt).toContain("feature/oauth")
    expect(result.session.confirmations[0].prompt).toContain("main")
  })

  it("creates commit_selection confirmation on inspect", async () => {
    setupCleanRepo()

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

    expect(inspect.success).toBe(true)
    expect(inspect.session.confirmations.some((c: any) => c.step === "commit_selection")).toBe(true)

    const commitConfirm = inspect.session.confirmations.find((c: any) => c.step === "commit_selection")
    expect(commitConfirm.status).toBe("pending")
    expect(commitConfirm.prompt).toContain("OAuth login")
  })

  it("inspect returns candidate commits not all commits, and plan requires selectedCommits", async () => {
    setupCleanRepo()

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

    // Should only return feature branch commits, not main branch commits
    expect(inspect.candidates.length).toBeGreaterThanOrEqual(1)
    expect(inspect.candidates.every((c: any) =>
      c.subject.includes("OAuth") || c.subject.includes("auth")
    )).toBe(true)

    // Should not include the initial main commit
    expect(inspect.candidates.some((c: any) => c.subject === "initial commit")).toBe(false)

    // Plan without selectedCommits should fail
    const planWithoutCommits = JSON.parse(await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(planWithoutCommits.error).toMatch(/selectedCommits required/)
  })

  it("plan without selectedCommits returns error", async () => {
    setupCleanRepo()

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

  it("stops on conflict scenario and does not auto-execute", async () => {
    setupConflictingRepo()

    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/conflict",
      featureDescription: "Conflicting feature",
    }, makeCtx()) as string)

    const inspect = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(inspect.candidates.length).toBeGreaterThanOrEqual(1)

    // Dependency detection should flag overlapping file changes within the feature branch
    expect(inspect.dependentCommits.length).toBeGreaterThanOrEqual(1)

    const shas = inspect.candidates.map((c: any) => c.sha)
    const plan = JSON.parse(await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
      selectedCommits: shas,
    }, makeCtx()) as string)

    // Tool should remain in dry-run mode — never executes commands
    expect(plan.plan.dryRun).toBe(true)
    expect(plan.plan.recommendedCommands.length).toBeGreaterThan(0)

    // Verify no branch was actually created by the tool
    const branches = git(["branch", "-a"])
    expect(branches.stdout).not.toContain("merge-assist/")

    // Verify the file on disk was NOT modified by the tool
    const content = readFileSync(join(TMP, "shared.txt"), "utf-8")
    expect(content).toBe("main changed this")

    // Status should require human confirmation, not auto-advance
    expect(plan.session.status).toBe("planning")
  })

  it("requires push_pr confirmation before completed status", async () => {
    setupCleanRepo()

    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    // Advance through all gates except push_pr
    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "branch_selection",
      approved: true,
    }, makeCtx())

    const inspect = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "commit_selection",
      approved: true,
    }, makeCtx())

    const shas = inspect.candidates.map((c: any) => c.sha)
    await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
      selectedCommits: shas,
    }, makeCtx())

    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "integration_branch",
      approved: true,
    }, makeCtx())

    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "method_selection",
      approved: true,
    }, makeCtx())

    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "dependency_inclusion",
      approved: true,
    }, makeCtx())

    await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "execute_plan",
      approved: true,
    }, makeCtx())

    // After execute_plan, status should be executing with push_pr confirmation pending
    const statusAfterExecute = JSON.parse(await mergeAssistTool.execute({
      action: "status",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(statusAfterExecute.session.status).toBe("executing")
    expect(statusAfterExecute.session.confirmations.some((c: any) => c.step === "push_pr")).toBe(true)
    expect(statusAfterExecute.session.confirmations.find((c: any) => c.step === "push_pr").status).toBe("pending")

    // Without push_pr approval, should NOT be completed
    expect(statusAfterExecute.session.status).not.toBe("completed")

    // Now approve push_pr
    const final = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "push_pr",
      approved: true,
    }, makeCtx()) as string)

    expect(final.session.status).toBe("completed")
  })

  it("plan returns dryRun=true and recommendedCommands as strings, not executed", async () => {
    setupCleanRepo()

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
    const plan = JSON.parse(await mergeAssistTool.execute({
      action: "plan",
      sessionId: start.session.id,
      selectedCommits: shas,
    }, makeCtx()) as string)

    expect(plan.plan.dryRun).toBe(true)
    expect(plan.plan.recommendedCommands.length).toBeGreaterThan(0)
    expect(plan.plan.recommendedCommands.every((cmd: any) => typeof cmd === "string")).toBe(true)

    // Verify cherry-pick commands are present but were NOT executed
    expect(plan.plan.recommendedCommands.some((cmd: string) => cmd.includes("cherry-pick"))).toBe(true)

    // Verify no integration branch was created
    const branches = git(["branch", "-a"])
    expect(branches.stdout).not.toContain("merge-assist/")
  })

  it("logs confirmation gates to audit log", async () => {
    setupCleanRepo()

    // Clear any existing log
    const logFile = join(TMP, ".opencode", "flowdeck.log")
    if (existsSync(logFile)) rmSync(logFile)

    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx())

    const logs = logRead(TMP)
    expect(logs.length).toBeGreaterThanOrEqual(2)
    expect(logs.some((l: any) => l.message.includes("started"))).toBe(true)
    expect(logs.some((l: any) => l.message.includes("inspected"))).toBe(true)
    expect(logs.every((l: any) => l.source === "merge-assist")).toBe(true)
  })

  it("abort sets status to aborted", async () => {
    setupCleanRepo()

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

  it("rejection at any gate does not advance status", async () => {
    setupCleanRepo()

    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/oauth",
      featureDescription: "OAuth login",
    }, makeCtx()) as string)

    // Reject branch selection
    const rejected = JSON.parse(await mergeAssistTool.execute({
      action: "confirm",
      sessionId: start.session.id,
      step: "branch_selection",
      approved: false,
    }, makeCtx()) as string)

    expect(rejected.approved).toBe(false)
    expect(rejected.session.status).toBe("clarifying")
    expect(rejected.session.confirmations[0].status).toBe("rejected")

    // Even if we try to inspect, the underlying status history shows rejection
    // The tool doesn't block inspect, but the confirmation remains rejected
    const inspect = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(inspect.session.confirmations[0].status).toBe("rejected")
  })

  it("detects dependencies in repo with prerequisite commits", async () => {
    setupRepoWithDependency()

    const start = JSON.parse(await mergeAssistTool.execute({
      action: "start",
      targetBranch: "main",
      sourceBranch: "feature/complex",
      featureDescription: "Complex feature",
    }, makeCtx()) as string)

    const inspect = JSON.parse(await mergeAssistTool.execute({
      action: "inspect",
      sessionId: start.session.id,
    }, makeCtx()) as string)

    expect(inspect.candidates.length).toBe(2)

    // The refactor commit should be detected as a dependency
    const refactorCommit = inspect.candidates.find((c: any) => c.subject.includes("refactor"))
    expect(refactorCommit).toBeDefined()
    expect(inspect.dependentCommits).toContain(refactorCommit.sha)

    // The feature commit may also be flagged since it touches a different file
    // but the refactor is definitely a dependency
    expect(inspect.dependentCommits.length).toBeGreaterThanOrEqual(1)
  })
})
