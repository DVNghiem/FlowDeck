# FlowDeck Skills

Skills are reusable workflow patterns installed into OpenCode. Invoke a skill in any OpenCode prompt by naming it: `"use the tdd-workflow skill to add tests for this module"`.

Skills live in `~/.config/opencode/skills/{name}/SKILL.md`. OpenCode loads them automatically.

## How Skills Differ from Agents

- **Agents** = specialist personas with focused roles and system prompts. An agent is a "who".
- **Skills** = process patterns any agent can follow. A skill is a "how".
- Skills are most useful when giving an agent a specific methodology to apply, rather than just a task description.

For example: `@tester use the tdd-workflow skill to add tests for the payments module` combines the tester agent's persona with the TDD skill's step-by-step process enforcement.

---

## Skill Quick Reference

| Skill | Purpose | Best used with |
|-------|---------|---------------|
| `api-design` | REST conventions, resource naming, status codes, pagination, versioning | `@architect`, `@reviewer` |
| `codebase-mapping` | Systematic `.codebase/` documentation from source files | `@mapper`, `@orchestrator` |
| `codebase-onboarding` | New contributor orientation, project documentation | `@code-explorer`, `@writer` |
| `code-review` | Structured review process with severity-tiered findings | `@reviewer`, `@security-auditor` |
| `code-tour` | Guided codebase walkthroughs as structured markdown | `@writer`, `@code-explorer` |
| `context-load` | Efficient session start: load STATE.md, PLAN.md, PROJECT.md | Any agent at session start |
| `debug-flow` | 6-step debug sequence: reproduce → trace → test → fix → verify | `@debug-specialist`, `@tester` |
| `dependency-audit` | CVE scanning, license compliance, outdated package detection | `@security-auditor`, `@reviewer` |
| `design-audit` | UI fidelity audit against approved design artifacts | `@design`, `@reviewer` |
| `ui-ux-planning` | UX flow and structure planning before implementation | `@design` |
| `wireframe-planning` | Wireframe-level layout and section planning | `@design` |
| `design-system-definition` | Token and component behavior guidance | `@design`, `@backend-coder` |
| `frontend-handoff` | Convert design outputs into implementation checklist | `@design`, `@backend-coder` |
| `responsive-review` | Responsive behavior and breakpoint review | `@design`, `@reviewer` |
| `dashboard-design` | Dashboard-specific hierarchy and data-density patterns | `@design` |
| `landing-page-design` | Conversion-oriented landing page structure | `@design` |
| `app-shell-design` | App shell and navigation model design | `@design` |
| `deploy-check` | Pre-deployment go/no-go checklist | `@orchestrator`, `@security-auditor` |
| `documentation-writer` | Technical writing standards for READMEs, API docs, changelogs | `@writer`, `@doc-updater` |
| `git-release` | Semantic versioning, changelog generation, release tagging | `@writer`, `@orchestrator` |
| `git-workflow` | Conventional commits, branching strategy, PR standards | `@backend-coder`, `@orchestrator` |
| `golang-patterns` | Idiomatic Go: error handling, goroutines, interfaces, testing | `@backend-coder`, `@reviewer` |
| `java-patterns` | Modern Java 17+: records, Spring Boot, JPA, CompletableFuture | `@backend-coder`, `@reviewer` |
| `multi-repo` | Cross-repo dependency graphs, contract-first changes, ordered rollouts | `@multi-repo-coordinator`, `@architect` |
| `parallel-execute` | Wave-based parallel task coordination and merge protocol | `@orchestrator`, `@task-splitter` |
| `performance-profiling` | Profiling methodology, bottleneck identification, before/after measurement | `@performance-optimizer` |
| `plan-task` | Wave-structured task planning with dependency graph and success criteria | `@planner`, `@planner` |
| `python-patterns` | Python 3.10+: type hints, dataclasses, asyncio, pytest | `@backend-coder`, `@reviewer` |
| `refactor-guide` | Safe refactoring: tests-first, one transformation per commit | `@refactor-guide`, `@backend-coder` |
| `rust-patterns` | Ownership, traits, async/Tokio, error handling, smart pointers | `@backend-coder`, `@reviewer` |
| `security-scan` | OWASP-based scanning, severity classification, PASS/FAIL verdict | `@security-auditor`, `@reviewer` |
| `tdd-workflow` | Red-Green-Refactor cycle, AAA pattern, 80% coverage target | `@tester`, `@backend-coder` |
| `test-coverage` | Coverage gap analysis, TDD enforcement, write-test-first cycle | `@tester`, `@reviewer` |

---

## Skill Categories

### Testing & Quality

#### `tdd-workflow`

Enforces the Red-Green-Refactor cycle. Write the failing test first, implement the minimum code to make it pass, then clean up while keeping tests green. The skill mandates an 80% coverage target as a by-product — the primary goal is meaningful tests that catch real regressions, not coverage numbers for their own sake. The skill covers test naming conventions (`should <verb> when <condition>`), the Arrange-Act-Assert structure, and git checkpoints between each cycle.

**Example invocation:**
```
@tester Use the tdd-workflow skill to add tests for src/services/order-service.ts.
        Start with a failing test for the calculateTotal function.
```

**When to use:** Any time a new function or feature is being implemented. Non-negotiable for bug fixes — write the failing regression test before applying the fix.

---

#### `test-coverage`

Analyzes coverage reports to find untested paths, edge cases, and error branches. It guides a write-test-first cycle: identify the gap, write the failing test, implement the minimum code to cover it, verify the gap is closed. Coverage is measured as a feedback signal, not a target to hit by writing empty assertions. The skill distinguishes between meaningful coverage (test exercises real logic) and nominal coverage (test hits the line but makes no assertions).

**Example invocation:**
```
@tester Use the test-coverage skill to identify gaps in src/auth/. Run the coverage report
        and write tests for any uncovered error paths.
```

**When to use:** Before a release when preparing code for review, or when coverage drops below the project threshold after a refactor.

---

#### `code-review`

Structures a code review as a systematic checklist pass with severity tiers: CRITICAL (security vulnerabilities, data corruption risk), HIGH (logic errors, broken edge cases), MEDIUM (quality issues, convention violations), and PASS. Only confirmed issues — 80%+ confidence — are reported. Each finding includes the file and line, a description of the problem, and a specific remediation step. Speculation without evidence is explicitly excluded.

**Example invocation:**
```
@reviewer Use the code-review skill to review src/routes/payments.ts.
          Report by severity. CRITICAL first.
```

**When to use:** Before merging any pull request, and before any production deployment on security-sensitive paths.

---

#### `security-scan`

Applies OWASP Top 10 checks as a structured pre-commit or pre-deploy scan. Covers injection (SQL, NoSQL, command), broken access control (missing auth checks, ownership bypasses), cryptographic failures (weak hashing, plaintext secrets), and dependency risks (known CVEs). Returns a PASS or FAIL verdict. Any CRITICAL or HIGH finding is a FAIL that blocks deployment until remediated with documented approval.

**Example invocation:**
```
@security-auditor Use the security-scan skill on the changed files in this PR.
                  Focus on A01 (access control) and A03 (injection). Return PASS or FAIL.
```

**When to use:** Before merging PRs that touch auth, data access, or API routes. Required before every production release.

---

### Development Process

#### `debug-flow`

A 6-step debugging sequence designed to find root causes, not suppress symptoms:
1. **Reproduce** — establish a minimal reproduction case with exact inputs
2. **Read** — read the full stack trace from top to bottom
3. **Trace** — trace the execution path backward from the failure point
4. **Hypothesize** — form a specific, falsifiable root cause hypothesis
5. **Test hypothesis** — write a failing test that confirms the hypothesis
6. **Fix** — apply the minimum change that makes the test pass and run the full suite

**Example invocation:**
```
@debug-specialist Use the debug-flow skill to diagnose the discount calculation bug.
                  The order total is wrong when both a coupon and loyalty credit are applied.
```

**When to use:** Any time a bug needs investigation before a fix is proposed. Skip if the fix is already known (e.g., a typo or a trivial null check).

---

#### `refactor-guide`

Enforces safe refactoring: tests must be green before starting, one transformation per commit, no behavior changes. The skill catalogs common safe transforms (extract function, rename variable, move module, inline variable) and orders them by risk from low to high. After each transformation the test suite must stay green — if it breaks, `git checkout .` and find a smaller step. No features are permitted in a refactoring session.

**Example invocation:**
```
@refactor-guide Use the refactor-guide skill on src/services/billing-service.ts.
                It's 700 lines. Extract functions and commit each transform separately.
```

**When to use:** When a file grows beyond 800 lines, when duplication is discovered, or when code is being prepared for a new feature that requires cleaner structure.

---

#### `api-design`

REST API design conventions covering: resource naming (nouns not verbs, plural collections), HTTP method semantics, status code correctness (201 for creation, 204 for deletion, 409 for conflict), pagination patterns (cursor-based vs offset, response envelope format), filtering and sorting query parameters, and URL versioning (`/v1/`). Also covers error response structure so clients can handle failures programmatically.

**Example invocation:**
```
@architect Use the api-design skill to review the new /orders endpoints.
           Check for resource naming, status codes, and pagination consistency.
```

**When to use:** When designing new API endpoints, reviewing an existing API for inconsistencies, or evaluating a third-party API before integration.

---

#### `plan-task`

Turns a feature description into a concrete, wave-structured execution plan. Each task is scoped to a file, sized to fit in one working session (≤3 hours), and assigned to a specific agent. The dependency graph drives wave ordering — tasks with no dependencies form Wave 1, tasks that depend on Wave 1 outputs form Wave 2, and so on. Each task has a success criterion that can be verified without running the full system.

**Example invocation:**
```
@planner Use the plan-task skill to plan the multi-factor authentication feature.
         Break it into waves. Every task should have a specific file scope and
         a verifiable success criterion.
```

**When to use:** Before starting any feature that touches more than two files, or any feature involving a data model change or API boundary change.

---

### Language-Specific

#### `python-patterns`

Idiomatic Python 3.10+ patterns for production code: type hints with `TypeVar` and `Protocol`, `dataclass` vs `TypedDict` vs Pydantic for data modeling, `asyncio` patterns (proper `await` chains, `asyncio.gather` for concurrency), generator functions for memory-efficient iteration, `pytest` fixtures and parametrize, and common pitfalls (mutable default arguments, late-binding closures, `is` vs `==`).

**Example invocation:**
```
@backend-coder Use the python-patterns skill to implement the data pipeline.
       Prefer dataclasses for the value objects and asyncio for IO operations.
```

**When to use:** When writing or reviewing Python code. Especially valuable for catching common pitfalls before they reach code review.

---

#### `golang-patterns`

Idiomatic Go for production services: explicit error handling with wrapped errors (`fmt.Errorf("context: %w", err)`), interface design (small, single-method interfaces preferred), goroutine lifecycle management (no leaked goroutines, context cancellation), channel patterns (fan-out, fan-in, done channels), table-driven tests with `t.Run`, and `go vet` / `staticcheck` compliance.

**Example invocation:**
```
@backend-coder Use the golang-patterns skill to implement the worker pool.
       Use proper goroutine lifecycle management and context cancellation.
```

**When to use:** When writing or reviewing Go code, particularly for concurrent processing logic or service layer design.

---

#### `java-patterns`

Modern Java 17+ patterns for production applications: records for immutable value objects, sealed classes for algebraic types, Stream API for collection processing, `CompletableFuture` for async composition, Spring Boot conventions (constructor injection, `@ConfigurationProperties`), JPA best practices (avoid N+1 with `@EntityGraph`, use projections for read models), and JUnit 5 / Mockito testing patterns.

**Example invocation:**
```
@backend-coder Use the java-patterns skill to implement the OrderService.
       Use records for the command objects and constructor injection for dependencies.
```

**When to use:** When writing or reviewing Java code in a Spring Boot application, particularly for service layer design and JPA query optimization.

---

#### `rust-patterns`

Safe, idiomatic Rust: ownership and borrowing mental model (own vs borrow vs borrow-mut), error handling with `Result<T, E>` and `?` propagation, trait design and `impl Trait` return types, async/await with Tokio (spawning tasks, `JoinHandle`, `select!`), smart pointer selection (`Box`, `Rc`, `Arc`, `RefCell`), and common compiler error resolutions for lifetime issues.

**Example invocation:**
```
@backend-coder Use the rust-patterns skill to implement the async HTTP client.
       Use Tokio and ensure proper error propagation with the ? operator.
```

**When to use:** When writing or reviewing Rust code. Particularly helpful when fighting the borrow checker or designing async services.

---

### Project & Codebase

#### `codebase-mapping`

Systematic approach to producing `.codebase/` documentation: `STACK.md` (exact pinned versions from manifest), `ARCHITECTURE.md` (component diagram and data flow), `STRUCTURE.md` (directory layout with purpose), `CONVENTIONS.md` (naming and coding patterns with file:line examples), `TESTING.md` (test frameworks and patterns), and `CONCERNS.md` (TODOs, FIXMEs, HACKs from grep). Factual-only — gaps are marked `UNKNOWN`, never filled with assumptions.

**Example invocation:**
```
@mapper Use the codebase-mapping skill to produce .codebase/CONVENTIONS.md.
        Read actual source files and include file:line examples for each pattern.
```

**When to use:** When starting work on an unfamiliar codebase, before a major feature, or when `.codebase/` is missing or stale (triggered by `/fd-map-codebase`).

---

#### `codebase-onboarding`

Guides systematic exploration of a new codebase for a new contributor or agent session. Covers: reading the project manifests for stack and dependencies, locating entry points, understanding the directory structure, tracing one request or operation end-to-end, and identifying the test setup. Produces a structured onboarding document an agent can reference without re-scanning files each session.

**Example invocation:**
```
@code-explorer Use the codebase-onboarding skill to orient yourself in this project.
               Trace one authenticated API request from route to database.
```

**When to use:** At the start of work on a project you haven't seen before, or when an agent needs to understand the project quickly without a full `/fd-map-codebase` run.

---

#### `code-tour`

Creates step-by-step guided walkthroughs of a codebase or code change as structured markdown. Each stop in the tour is a specific file and line range with explanation of what the code does and why it matters. Tours are useful for onboarding documents, PR review guides on complex changes, and architectural explainers for non-contributors.

**Example invocation:**
```
@writer Use the code-tour skill to create a tour of the authentication flow.
        Start at the route handler and walk through to the JWT generation.
        Save to docs/tours/auth-flow.md.
```

**When to use:** When onboarding a new developer, explaining a complex architecture to stakeholders, or creating a review guide for a large PR.

---

#### `context-load`

Loads the minimum set of project files to brief any agent on the current project state: `STATE.md` (current phase and active plan), `PLAN.md` (what is being built), `PROJECT.md` (project vision and constraints), `CONVENTIONS.md` (coding patterns to match), and `ARCHITECTURE.md` (system design). Takes under 30 seconds and ensures the agent doesn't make decisions based on stale context.

**Example invocation:**
```
@orchestrator Use the context-load skill at session start before taking any action.
```

**When to use:** At the start of every OpenCode session, or any time an agent seems unaware of the current project state or phase.

---

### DevOps & Operations

#### `deploy-check`

Pre-deployment verification checklist covering four parallel checks: full test suite (all tests pass, no skips), security scan (no CRITICAL or HIGH findings), CVE audit (no known vulnerabilities in dependencies), and build verification (clean build, no warnings treated as errors). Returns GO or NO-GO. Any CRITICAL or HIGH finding produces NO-GO with a specific list of required fixes before deployment can proceed.

**Example invocation:**
```
@orchestrator Use the deploy-check skill before releasing to production.
              Run all checks in parallel and produce the GO/NO-GO report.
```

**When to use:** Before every production deployment. Required for any release, including hotfixes.

---

#### `git-workflow`

Branching strategy (feature branches from `main`, naming convention `feat/`, `fix/`, `chore/`), conventional commit format (`feat(scope): description`, `fix`, `refactor`, `docs`, `test`, `chore`), PR standards (description template, link to issue, checklist), and merge vs rebase guidance (rebase to clean up local history; merge for PR integration).

**Example invocation:**
```
@backend-coder Use the git-workflow skill to commit the authentication changes.
       Write a conventional commit message and create the PR.
```

**When to use:** When starting a feature branch, creating a PR, or cleaning up commit history before a merge.

---

#### `git-release`

Creates consistent releases with semantic versioning, changelog generation from merged PRs, and release tagging. Determines the version bump (major for breaking changes, minor for new features, patch for bug fixes), drafts release notes in Keep a Changelog format under `## [x.y.z]`, and provides a copy-pasteable sequence of tag and push commands.

**Example invocation:**
```
@writer Use the git-release skill to cut version 2.1.0.
        Collect merged PRs since the last tag and generate the changelog entry.
```

**When to use:** When a milestone is complete and ready to ship, or when a hotfix needs a patch release.

---

#### `dependency-audit`

Audits npm, pip, or cargo dependencies for: known CVEs (using `npm audit`, `pip-audit`, or `cargo audit`), outdated packages with available security patches, and license issues (GPL in a commercial project, missing attribution). Produces a severity-ranked report and a remediation plan with specific upgrade commands. Does not blindly update all dependencies — only those with security or compatibility issues.

**Example invocation:**
```
@security-auditor Use the dependency-audit skill to audit package.json dependencies.
                  Flag any packages with known CVEs and propose targeted upgrades.
```

**When to use:** Before any production release, when a CVE alert is received, or when adding a major new dependency to the project.

---

#### `performance-profiling`

Profiling methodology that prevents premature optimization: measure first, then optimize. Covers Node.js CPU profiling (`node --prof`), bundle analysis (`webpack-bundle-analyzer`, `source-map-explorer`), database query analysis (`EXPLAIN ANALYZE`), and browser performance (Lighthouse, Core Web Vitals). All findings are reported as before/after measurements. No optimization is proposed without profiling data.

**Example invocation:**
```
@performance-optimizer Use the performance-profiling skill on the /api/reports endpoint.
                       Profile the database queries and identify the N+1 pattern.
```

**When to use:** When users report slowness, before releasing a performance-sensitive feature, or when a new feature has been added to a hot code path.

---

### Architecture

#### `multi-repo`

Patterns for coordinating changes across multiple repositories in a microservice system. Covers: reading the sub-repo registry, building a dependency graph (upstream-api → downstream-consumer → gateway), classifying changes as breaking or non-breaking, writing contract-first change specifications, ordering implementation so upstream services are deployed before downstream consumers, and verifying cross-repo integration.

**Example invocation:**
```
@multi-repo-coordinator Use the multi-repo skill to plan the user-service API change.
                        Identify all downstream consumers and produce an ordered change plan.
```

**When to use:** Any time a change affects more than one repository. Do not use for single-repo work, even if the repo is part of a larger microservice system.

---

#### `parallel-execute`

Coordinates parallel agent execution for independent workstreams. Provides the WAVE TABLE format, the standard wave delegation syntax, the independence verification rules (parallel = different files + no shared state + no inter-task dependency), the merge protocol for when parallel tracks produce overlapping output, and the conflict resolution hierarchy.

**Example invocation:**
```
@orchestrator Use the parallel-execute skill to run Wave 3 of the current plan.
                      @backend-coder and @tester are independent — start both simultaneously.
```

**When to use:** When a plan has tasks that can run simultaneously. The skill makes independence explicit so merge conflicts are caught before they occur.

---

### Documentation

#### `documentation-writer`

Technical writing standards for documentation that developers actually read. Covers: README structure (name → quick start → installation → usage → API reference → contributing → license), API reference format (function signature, parameters with types and defaults, return type, usage example, error conditions), changelog format (Keep a Changelog: Added / Changed / Deprecated / Removed / Fixed / Security), and inline comment guidelines (explain the why, not the what; mark known footguns explicitly).

**Example invocation:**
```
@writer Use the documentation-writer skill to write the README for the payments module.
        Cover: purpose, quick start, configuration, and API reference.
        Verify all examples compile before including them.
```

**When to use:** When creating any new documentation file, or when existing documentation is out of date or missing key sections.

---

← [Back to Index](index.md)
