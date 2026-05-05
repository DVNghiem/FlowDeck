/**
 * Policy Compiler Service
 * Compiles human-readable POLICIES.json rules into runtime evaluators.
 * Also learns new policies from failure patterns.
 */
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/planning-state-lib"
import type { Policy, PolicyStore } from "../tools/policy-engine"

export interface PolicyContext {
  command?: string
  file_path?: string
  change_description?: string
  tool?: string
  risk_score?: number
}

export interface PolicyViolation {
  policy_id: string
  policy_name: string
  rule: string
  trigger: string
  severity: "block" | "warn"
}

function loadPolicies(dir: string): Policy[] {
  const p = join(codebaseDir(dir), "POLICIES.json")
  if (!existsSync(p)) return []
  try {
    const store = JSON.parse(readFileSync(p, "utf-8")) as PolicyStore
    return store.policies.filter(p => p.active)
  } catch {
    return []
  }
}

function matchesTrigger(trigger: string, ctx: PolicyContext): boolean {
  const t = trigger.toLowerCase()
  const fields = [
    ctx.command ?? "",
    ctx.file_path ?? "",
    ctx.change_description ?? "",
    ctx.tool ?? "",
  ].map(s => s.toLowerCase())

  // Simple multi-word matching: all words in trigger must appear in at least one field
  const words = t.split(/\s+/).filter(Boolean)
  return words.some(word => fields.some(f => f.includes(word)))
}

function deriveSeverity(rule: string): "block" | "warn" {
  const blocking = ["never", "always block", "must not", "forbidden", "require approval", "requires approval"]
  const lower = rule.toLowerCase()
  return blocking.some(kw => lower.includes(kw)) ? "block" : "warn"
}

export function evaluatePolicies(dir: string, ctx: PolicyContext): PolicyViolation[] {
  const policies = loadPolicies(dir)
  const violations: PolicyViolation[] = []

  for (const policy of policies) {
    if (matchesTrigger(policy.trigger, ctx)) {
      violations.push({
        policy_id: policy.id,
        policy_name: policy.name,
        rule: policy.rule,
        trigger: policy.trigger,
        severity: deriveSeverity(policy.rule),
      })
    }
  }

  // Evaluate TDD enforcement policies
  for (const tddPolicy of TDD_POLICIES) {
    if (matchesTrigger(tddPolicy.trigger, ctx)) {
      violations.push({
        policy_id: `tdd-${tddPolicy.name.replace(/\s+/g, "-").toLowerCase()}`,
        policy_name: tddPolicy.name,
        rule: tddPolicy.rule,
        trigger: tddPolicy.trigger,
        severity: tddPolicy.severity,
      })
    }
  }

  return violations
}

export interface ProposedPolicy {
  id: string
  name: string
  trigger: string
  rule: string
  source: "learned"
  failure_count: number
  rationale: string
}

const FAILURE_RULES: Array<{
  path_pattern: RegExp
  name: string
  trigger: string
  rule: string
  rationale: string
}> = [
  {
    path_pattern: /auth|login|password|jwt|session|oauth/i,
    name: "Require approval for auth changes",
    trigger: "auth change",
    rule: "Require human approval before editing authentication or session logic",
    rationale: "Auth changes have high blast radius and are frequent sources of security regressions",
  },
  {
    path_pattern: /payment|billing|stripe|credit/i,
    name: "Require approval for payment changes",
    trigger: "payment file",
    rule: "Require human approval before editing payment or billing logic",
    rationale: "Payment changes risk revenue loss and PCI compliance violations",
  },
  {
    path_pattern: /migration|migrate|schema|alembic/i,
    name: "Always add tests for schema changes",
    trigger: "database migration",
    rule: "Always add integration tests before applying a database migration",
    rationale: "Schema migrations are irreversible and have caused data loss in past failures",
  },
  {
    path_pattern: /infra|terraform|k8s|kubernetes|ansible|helm/i,
    name: "Never edit infra without review",
    trigger: "infra change",
    rule: "Never edit infrastructure configuration without a reviewer sign-off",
    rationale: "Infrastructure changes caused downtime in past incidents",
  },
  {
    path_pattern: /\.env|secrets\.|config\/prod/i,
    name: "Block writes to secrets files",
    trigger: "secrets file",
    rule: "Never write directly to .env or secrets files — use vault/config management",
    rationale: "Direct writes to secrets files risk credential leaks",
  },
]

/**
 * TDD Enforcement Policies
 * These policies enforce test-first development discipline.
 */

const TDD_POLICIES: Array<{
  name: string
  trigger: string
  rule: string
  severity: "block" | "warn"
}> = [
  {
    name: "No implementation without failing test",
    trigger: "fd-new-feature",
    rule: "Never begin implementation until a failing test exists for the target behavior",
    severity: "warn",
  },
  {
    name: "No refactor without green tests",
    trigger: "refactor implementation",
    rule: "Never refactor while tests are not green — maintain passing test state",
    severity: "block",
  },
  {
    name: "Bugfix requires regression test",
    trigger: "fd-fix-bug",
    rule: "Every bugfix must include a regression test unless override is explicitly granted",
    severity: "warn",
  },
  {
    name: "Missing tests are major findings",
    trigger: "code review",
    rule: "Flag missing or weak tests as major findings in code review — not minor",
    severity: "warn",
  },
  {
    name: "Deploy blocked without test coverage",
    trigger: "fd-deploy-check",
    rule: "Fail deploy check when expected tests are missing for changed code",
    severity: "block",
  },
  {
    name: "TDD override must be logged",
    trigger: "override TDD",
    rule: "Every TDD stage override must be logged in override_log and surfaced in review",
    severity: "warn",
  },
]

export function learnFromFailure(
  failure_type: string,
  affected_paths: string[],
  root_cause?: string
): ProposedPolicy | null {
  const allPaths = [failure_type, ...(affected_paths ?? []), root_cause ?? ""].join(" ")

  for (const rule of FAILURE_RULES) {
    if (rule.path_pattern.test(allPaths)) {
      const id = `learned-${rule.trigger.replace(/\s+/g, "-")}-${Date.now()}`
      return {
        id,
        name: rule.name,
        trigger: rule.trigger,
        rule: rule.rule,
        source: "learned",
        failure_count: 1,
        rationale: rule.rationale,
      }
    }
  }

  return null
}

export function formatViolations(violations: PolicyViolation[]): string {
  if (violations.length === 0) return ""
  const lines = [
    `  Policy violations (${violations.length}):`,
    ...violations.map(v => {
      const icon = v.severity === "block" ? "✗" : "⚠"
      return `  ${icon} [${v.policy_id}] ${v.policy_name}: ${v.rule}`
    }),
  ]
  return lines.join("\n")
}
