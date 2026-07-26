import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const TMP = join(tmpdir(), "validate-docs-test-" + process.pid)
const SCRIPT = join(process.cwd(), "scripts", "validate-docs.mjs")

function buildFixture(name: string, mutate: (root: string) => void) {
  const root = join(TMP, name)
  if (existsSync(root)) rmSync(root, { recursive: true })
  mkdirSync(root, { recursive: true })

  // src/commands
  mkdirSync(join(root, "src", "commands"), { recursive: true })
  writeFileSync(join(root, "src", "commands", "fd-checkpoint.md"), "# /fd-checkpoint\n", "utf-8")
  writeFileSync(join(root, "src", "commands", "fd-execute.md"), "# /fd-execute\n", "utf-8")

  // src/skills
  mkdirSync(join(root, "src", "skills", "skill-a"), { recursive: true })
  mkdirSync(join(root, "src", "skills", "skill-b"), { recursive: true })

  // src/agents
  mkdirSync(join(root, "src", "agents"), { recursive: true })
  writeFileSync(
    join(root, "src", "agents", "index.ts"),
    [
      "export const agents = [",
      "  'orchestrator',",
      "  'planner',",
      "  'coder',",
      "]",
      "",
    ].join("\n"),
    "utf-8",
  )

  // docs/commands
  mkdirSync(join(root, "docs", "commands"), { recursive: true })
  writeFileSync(join(root, "docs", "commands", "fd-checkpoint.md"), "# /fd-checkpoint\n", "utf-8")
  writeFileSync(join(root, "docs", "commands", "fd-execute.md"), "# /fd-execute\n", "utf-8")

  // README.md
  writeFileSync(
    join(root, "README.md"),
    [
      "# FlowDeck",
      "",
      "- 🤖 **3 agents** — orchestrator, planner, coder",
      "- 🛠️ **2 skills** — reusable workflow patterns",
      "- ⚡ **2 commands** — `/fd-checkpoint`, `/fd-execute`",
      "",
    ].join("\n"),
    "utf-8",
  )

  // docs/index.md
  mkdirSync(join(root, "docs"), { recursive: true })
  writeFileSync(
    join(root, "docs", "index.md"),
    [
      "# FlowDeck",
      "",
      "- **3 agents** — orchestrator, planner, coder",
      "- **2 skills** — reusable workflow patterns",
      "- **2 commands** — `/fd-checkpoint`, `/fd-execute`",
      "",
    ].join("\n"),
    "utf-8",
  )

  // mkdocs.yml
  writeFileSync(join(root, "mkdocs.yml"), "site_name: FlowDeck\n", "utf-8")

  // VERSION
  writeFileSync(join(root, "VERSION"), "1.0.0\n", "utf-8")

  // package.json
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "flowdeck", version: "1.0.0" }, null, 2) + "\n",
    "utf-8",
  )

  mutate(root)
  return root
}

function runValidator(root: string) {
  return spawnSync("node", [SCRIPT, `--root=${root}`], {
    encoding: "utf-8",
  })
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe("validate-docs.mjs", () => {
  it("fails when a docs file references a missing command", () => {
    const root = buildFixture("missing-command", (r) => {
      writeFileSync(
        join(r, "docs", "commands", "fd-execute.md"),
        "# /fd-execute\n\nUse /fd-ghost to do nothing.\n",
        "utf-8",
      )
    })
    const result = runValidator(root)
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("references missing command /fd-ghost")
  })

  it("fails on command-directory parity mismatch", () => {
    const root = buildFixture("command-parity", (r) => {
      writeFileSync(join(r, "docs", "commands", "fd-only-in-docs.md"), "# /fd-only-in-docs\n", "utf-8")
    })
    const result = runValidator(root)
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("command-directory parity mismatch")
  })

  it("fails with VERSION X but package.json.version is Y when versions differ", () => {
    const root = buildFixture("bad-version", (r) => {
      writeFileSync(join(r, "VERSION"), "9.9.9\n", "utf-8")
    })
    const result = runValidator(root)
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("VERSION is 9.9.9 but package.json.version is 1.0.0")
  })

  it("fails when README has a broken relative link", () => {
    const root = buildFixture("broken-link", (r) => {
      writeFileSync(
        join(r, "README.md"),
        [
          "# FlowDeck",
          "",
          "See [guide](docs/does-not-exist.md) for details.",
          "",
          "- 🤖 **3 agents** — orchestrator, planner, coder",
          "- 🛠️ **2 skills** — reusable workflow patterns",
          "- ⚡ **2 commands** — `/fd-checkpoint`, `/fd-execute`",
          "",
        ].join("\n"),
        "utf-8",
      )
    })
    const result = runValidator(root)
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("broken relative link docs/does-not-exist.md")
  })

  it("fails when docs/index.md declares a wrong command count", () => {
    const root = buildFixture("doc-count-mismatch", (r) => {
      writeFileSync(
        join(r, "docs", "index.md"),
        [
          "# FlowDeck",
          "",
          "- **3 agents** — orchestrator, planner, coder",
          "- **2 skills** — reusable workflow patterns",
          "- **99 commands** — placeholder",
          "",
        ].join("\n"),
        "utf-8",
      )
    })
    const result = runValidator(root)
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("declares 99 commands but src/commands has 2")
  })

  it("fails when README declares a wrong agent count", () => {
    const root = buildFixture("agent-count-mismatch", (r) => {
      writeFileSync(
        join(r, "README.md"),
        [
          "# FlowDeck",
          "",
          "- 🤖 **99 agents** — orchestrator, planner, coder",
          "- 🛠️ **2 skills** — reusable workflow patterns",
          "- ⚡ **2 commands** — `/fd-checkpoint`, `/fd-execute`",
          "",
        ].join("\n"),
        "utf-8",
      )
    })
    const result = runValidator(root)
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toContain("declares 99 agents but src/agents has 3")
  })
})
