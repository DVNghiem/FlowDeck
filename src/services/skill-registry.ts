/**
 * Skill Permission Registry
 *
 * Defines which skills each agent is allowed to load. Skills live in
 * `src/skills/<name>/SKILL.md` and are registered with OpenCode via
 * `cfg.skills.paths` (see src/index.ts), then invoked through the native
 * `skill` tool.
 *
 * Enforcement is by prompt, not by interception: `buildSkillGate()` renders an
 * explicit allow/deny block that each agent factory injects into its prompt, so
 * agents self-enforce. Nothing here changes the OpenCode SDK or the `skill`
 * tool itself.
 *
 * The orchestrator is unrestricted — it coordinates all stages.
 *
 * Three skills on disk are deliberately in no agent's list and are therefore
 * orchestrator-only: `context-guard`, `session-persistence`, `telemetry-steward`.
 */

export const SKILL_REGISTRY: Record<string, string[] | "*"> = {
  orchestrator: "*",  // unrestricted — coordinates all stages

  planner: [
    "research-first",
    "change-impact-radar",
    "blast-radius-preview",
    "arch-constraint-guard",
    "decision-trace",
    "context-budget",
    "context-steward",
  ],

  architect: [
    "clean-architecture",
    "hexagonal-architecture",
    "layered-architecture",
    "ddd-architecture",
    "cqrs",
    "saga-architecture",
    "event-driven-architecture",
    "api-design",
    "arch-constraint-guard",
    "decision-trace",
    "context-budget",
    "context-steward",
  ],

  researcher: [
    "research-first",
    "codebase-mapping",
    "repo-memory-graph",
    "context-budget",
    "context-steward",
  ],

  mapper: [
    "codebase-mapping",
    "repo-memory-graph",
    "context-steward",
  ],

  "backend-coder": [
    "backend-patterns",
    "tdd-workflow",
    "refactor-guide",
    "api-design",
    "postgres-patterns",
    "python-patterns",
    "golang-patterns",
    "rust-patterns",
    "java-patterns",
    "django-patterns",
    "django-tdd",
    "clean-architecture",
    "dependency-audit",
    "context-budget",
    "context-steward",
  ],

  "frontend-coder": [
    "frontend-pattern",
    "tdd-workflow",
    "refactor-guide",
    "api-design",
    "context-budget",
    "context-steward",
  ],

  devops: [
    "git-workflow",
    "git-release",
    "dependency-audit",
    "context-steward",
  ],

  tester: [
    "tdd-workflow",
    "test-gap-detector",
    "django-tdd",
    "context-steward",
  ],

  reviewer: [
    "code-review",
    "blast-radius-preview",
    "change-impact-radar",
    "arch-constraint-guard",
    "refactor-guide",
    "context-budget",
    "context-steward",
  ],

  "security-auditor": [
    "security-scan",
    "arch-constraint-guard",
    "context-steward",
  ],

  "debug-specialist": [
    "debug-flow",
    "failure-replay-engine",
    "self-healing-policies",
    "performance-profiling",
    "context-steward",
  ],
}

/**
 * Returns the allowed skill list for an agent.
 * Returns null for unrestricted agents ("*") and for unknown agent names.
 */
export function getAllowedSkills(agentName: string): string[] | null {
  const entry = SKILL_REGISTRY[agentName]
  if (!entry || entry === "*") return null
  return entry
}

/**
 * Generates a skill gate instruction block for injection into agent prompts.
 * Returns an empty string for unrestricted agents.
 */
export function buildSkillGate(agentName: string): string {
  const allowed = getAllowedSkills(agentName)
  if (!allowed) return ""

  return `
## Skill Permissions

You MAY only load skills from this list:
${allowed.map(s => `  - ${s}`).join("\n")}

You MUST NOT load any skill not in this list.
If you need a skill outside your list, report it to the orchestrator — do not load it.
`.trim()
}
