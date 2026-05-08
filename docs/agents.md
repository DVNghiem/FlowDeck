# FlowDeck Agents

Agents are specialized AI personas installed into OpenCode. Each agent has a focused role and system prompt. Invoke them in any OpenCode prompt with `@agent-name`.

## How to Use Agents

```
@architect Design the database schema for a multi-tenant SaaS app
@coder Implement the UserRepository class following the interface in src/interfaces/
@reviewer Review src/auth/jwt.ts for security issues
```

Agents are installed to `~/.config/opencode/agent/`. OpenCode loads them automatically — no additional configuration needed.

---

## Agent Quick Reference

| Agent | Role | Best for |
|-------|------|----------|
| [@architect](#architect) | Designs system architecture, creates ADRs, defines interface contracts | New modules, API design, schema changes, cross-cutting concerns |
| [@build-error-resolver](#build-error-resolver) | Diagnoses and fixes build failures, type errors, and dependency issues | Broken builds, type mismatches, missing modules |
| [@code-explorer](#code-explorer) | Reads and maps unfamiliar codebases systematically | Understanding unknown code before modifying it |
| [@coder](#coder) | Implements features and fixes following confirmed plans | All code implementation tasks |
| [@debug-specialist](#debug-specialist) | Root cause analysis via hypothesis-driven investigation | Deep bugs that require systematic tracing |
| [@design](#design) | Runs design-first UI workflow with structured handoff artifacts | Landing pages, dashboards, admin panels, app screens, UX-heavy features |
| [@discusser](#discusser) | Structured requirements Q&A, one question at a time | Starting new projects, defining feature scope |
| [@doc-updater](#doc-updater) | Keeps documentation in sync with code changes | Post-implementation doc maintenance |
| [@plan-checker](#plan-checker) | Validates plans before execution for completeness and feasibility | Quality gate before running a plan |
| [@planner](#planner) | Creates detailed, wave-structured implementation plans | Creating execution-ready PLAN.md files |
| [@mapper](#mapper) | Maps codebase to `.codebase/` structured documentation | Producing STACK.md, ARCHITECTURE.md, CONVENTIONS.md, and more |
| [@multi-repo-coordinator](#multi-repo-coordinator) | Cross-repo dependency graphs, change propagation, ordered CHANGE PLANs | Features spanning multiple microservices |
| [@orchestrator](#orchestrator) | Coordinates multi-agent workflows, phase gating, go/no-go decisions | End-to-end feature delivery |
| [@parallel-coordinator](#parallel-coordinator) | Wave-based parallel execution with WAVE TABLE format and merge protocol | Maximizing throughput on complex tasks |
| [@performance-optimizer](#performance-optimizer) | Profiling-first bottleneck identification and targeted fixes | Slow endpoints, N+1 queries, bundle bloat |
| [@planner](#planner) | Implementation planning with explicit user confirmation before execution | Planning any multi-file feature |
| [@refactor-guide](#refactor-guide) | Safe refactoring with test-first guarantees, preserves external behavior | Cleanup, extraction, debt reduction |
| [@researcher](#researcher) | API documentation research, library comparison, cited sources | Understanding unfamiliar APIs before implementation |
| [@reviewer](#reviewer) | Code review covering security, logic, and quality — 80% confidence threshold | Pre-merge and pre-deploy code checks |
| [@security-auditor](#security-auditor) | OWASP-based scanning, PASS/FAIL report, severity classification | Security-sensitive changes, pre-release audits |
| [@task-splitter](#task-splitter) | Dependency graph decomposition, wave-based work breakdown | Decomposing large tasks into parallel workstreams |
| [@tester](#tester) | TDD (Red-Green-Refactor), AAA pattern, unit/integration/e2e tests | Writing tests for features and bug regressions |
| [@writer](#writer) | Technical documentation, ADRs, READMEs, changelog entries | Any documentation creation or update task |

---

### @design

The design agent is a dedicated UI/UX specialist that runs before implementation on UI-heavy tasks. It outputs structured design artifacts covering discovery, UX flow, wireframe layout, visual system direction, and frontend handoff checklist. For existing implementations, it performs design fidelity review and reports hierarchy, spacing, responsiveness, accessibility, and state-coverage gaps.

**Best for:**
- Classifying user-facing task types (landing page, dashboard, admin panel, app screen)
- Producing implementation-ready UI handoff before coding starts
- Reviewing UI output against approved design artifacts during verification
- Defining reusable token/component guidance for consistency

**Example usage:**
```
@design Run design-first workflow for: redesign onboarding dashboard.
        Output structured handoff artifact with approval checklist.
```

**Works with:** `@coder` (consumes handoff artifact), `@reviewer` (code-quality + design-fidelity checks), `@orchestrator` (enforces design gate before implementation)

---

## Detailed Agent Profiles

### @architect

The architect designs systems before anyone writes code. It reads existing architecture documents and conventions first, then proposes decisions in writing — as ADRs and TypeScript interface contracts — before any implementation begins. It applies principles like "no speculative abstraction" (only abstract when there are 3+ concrete use cases) and surfaces conflicts with existing decisions rather than resolving them silently.

**Model:** `anthropic/claude-opus-4-5`

**Best for:**
- Designing database schemas, API boundaries, and service interfaces for new features
- Writing Architecture Decision Records (ADRs) for non-obvious technical choices
- Defining TypeScript interface contracts before implementation starts
- Identifying cross-cutting concerns such as authentication, logging, and rate limiting

**Example usage:**
```
@architect We need to add subscription billing. Design the data model and service interfaces.
           Read .codebase/ARCHITECTURE.md first. Save the ADR to .planning/adr/.
```

**Works with:** `@coder` (consumes interface contracts), `@planner` (uses ADRs as planning input), `@multi-repo-coordinator` (defines contract-first change specs)

---

### @build-error-resolver

The build error resolver collects all build errors before touching a single file. It runs the full diagnostic suite (`tsc --noEmit`, build, lint, tests) and reads the complete output — never skims — because the first error is almost always the root cause and later errors are cascades. It applies the minimum fix to resolve the root cause, then re-runs to confirm no cascades remain.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Diagnosing TypeScript type errors, missing modules, and circular imports
- Resolving broken builds after dependency updates or refactors
- Fixing compilation failures in a cascading error scenario
- Identifying the root error versus cascade errors in a long error log

**Example usage:**
```
@build-error-resolver The CI build is failing after the auth refactor. Run the diagnostics
                      and fix the root cause with minimal changes.
```

**Works with:** `@coder` (applies fixes identified by the resolver), `@orchestrator` (escalates build failures during plan execution), `@reviewer` (verifies fix quality)

---

### @code-explorer

The code explorer maps unfamiliar code before anyone modifies it. It is read-only by design — it reports what it finds, not what it expects. Starting from the top-level directory, it traces entry points and call paths, identifies key abstractions and data models, and documents conventions in use. Its output gives other agents the context they need to make surgical changes.

**Model:** `anthropic/claude-haiku-4-5`

**Best for:**
- Understanding a new module or service before making changes to it
- Tracing a specific flow end-to-end (e.g., HTTP request to database to response)
- Identifying where in the codebase a task-relevant piece of logic lives
- Feeding structural context to `@architect` or `@coder` before implementation

**Example usage:**
```
@code-explorer Map the authentication flow in src/auth/. Trace a login request from the
              route handler to the database query. Identify the session management approach.
```

**Works with:** `@architect` (provides structural context for design decisions), `@coder` (surfaces conventions to match), `@mapper` (complements deeper .codebase/ documentation)

---

### @coder

The coder implements features and fixes following a confirmed plan. It reads conventions and architecture docs before touching any source file, matches existing patterns precisely, and makes only the changes the task requires — no drive-by refactors. Functions stay under 50 lines. Every external input is validated at the boundary. If the plan is unclear or technically infeasible, it stops and asks rather than guessing.

**Model:** `anthropic/claude-opus-4-5`

**Best for:**
- Implementing any feature step once a plan has been confirmed
- Applying fixes identified by `@debug-specialist` or `@build-error-resolver`
- Executing a single wave of a parallel execution plan
- Making surgical changes to existing code with minimal diff surface area

**Example usage:**
```
@coder Implement the UserRepository class defined in contracts/user-repository.ts.
       Follow patterns in src/repositories/order-repository.ts. No new dependencies.
```

**Works with:** `@tester` (verifies implementation), `@reviewer` (reviews the diff), `@architect` (consumes interface contracts)

---

### @debug-specialist

The debug specialist finds root causes through systematic investigation — never by guessing. It reads the full stack trace from top to bottom, traces execution backward from the point of failure, and identifies the earliest point in the call chain where invariants are violated. For regressions, it uses `git bisect` to identify the culprit commit. It produces a structured debug report before any fix is proposed.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Diagnosing intermittent failures, race conditions, and memory leaks
- Tracing the cause of a `Cannot read property of undefined` or similar runtime error
- Using `git bisect` to find which commit introduced a regression
- Writing a hypothesis and validating it before touching any code

**Example usage:**
```
@debug-specialist The order total is calculated incorrectly when a discount code is applied
                  alongside a loyalty credit. Trace the calculation path and identify the root cause.
```

**Works with:** `@tester` (writes the regression test once root cause is confirmed), `@coder` (applies the minimal fix), `@build-error-resolver` (handles compile-time failures the debug specialist doesn't cover)

---

### @discusser

The discusser extracts clear requirements through focused, one-at-a-time questioning. It never asks two questions in a single turn. Every decision is numbered (D-01, D-02, ...) and recorded with its rationale. If a new answer conflicts with a previous decision, it flags the conflict immediately and presents options. All decisions are saved to `.planning/phases/phase-N/DISCUSS.md` in a format that `@planner` can trace back to individual tasks.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Defining the scope of a new project or feature phase before planning begins
- Surfacing implicit assumptions and resolving ambiguity through structured Q&A
- Producing a numbered decision log that links requirements to implementation tasks
- Detecting and resolving conflicts between requirements early

**Example usage:**
```
@discusser We want to add multi-factor authentication. Ask me the questions you need
           to nail down the requirements. One question at a time.
```

**Works with:** `@planner` (uses DISCUSS.md as plan input), `@orchestrator` (manages the discuss phase), `@planner` (alternative for lighter planning workflows)

---

### @doc-updater

The doc updater synchronizes documentation with the current implementation after code changes. It targets README installation instructions, API reference function signatures, inline comments on complex algorithms, and changelog entries under `## Unreleased`. It verifies that every example it writes actually compiles and runs. Dead links and dead examples are removed, not left behind.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Updating API reference docs after function signatures change
- Syncing README quick-start examples after CLI or config changes
- Adding changelog entries in Keep a Changelog format after a feature lands
- Removing stale documentation references after code is deleted

**Example usage:**
```
@doc-updater The auth module was refactored in this PR. Update docs/api/auth.md to match
             the new function signatures and verify the examples still compile.
```

**Works with:** `@writer` (writer drafts new docs; doc-updater keeps them current), `@reviewer` (flags doc accuracy issues during review), `@code-explorer` (reads current implementation to verify accuracy)

---

### @plan-checker

The plan checker reviews a PLAN.md before execution and returns a scored PASS or FAIL verdict. It checks three dimensions: completeness (all requirements from DISCUSS.md are covered, every task has a defined scope and success criteria), feasibility (no task exceeds 3 hours, no circular dependencies, no assumed capabilities that don't exist), and testability (each success criterion is observable, edge cases are addressed, verification commands are specified). A score of 8–10 earns PASS, 6–7 earns PASS_WITH_NOTES, and 0–5 earns FAIL.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Catching vague success criteria before they cause ambiguous execution
- Identifying tasks with missing file paths or verification steps
- Ensuring every requirement from DISCUSS.md is mapped to at least one task
- Flagging infeasible tasks that assume capabilities not yet in the codebase

**Example usage:**
```
@plan-checker Review .planning/phases/phase-1/PLAN.md. Score it and return
              PASS or FAIL with specific recommendations for any failures.
```

**Works with:** `@planner` (generates the plan this agent reviews), `@orchestrator` (receives the verdict and decides whether to proceed)

### @mapper

The mapper produces factual codebase documentation for the `.codebase/` directory. In a parallel run of 6 instances, each mapper is assigned one output file: `STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, or `CONCERNS.md`. It reads source files directly and reports only what it can verify — any gap is marked `UNKNOWN — needs verification` rather than filled with assumptions. Every claim is traceable to a specific file path.

**Model:** `google/gemini-2.5-flash`

**Best for:**
- Generating `.codebase/CONVENTIONS.md` with real naming patterns backed by file:line examples
- Producing `STACK.md` with exact pinned versions from manifest files
- Populating `CONCERNS.md` by grepping for `TODO`, `FIXME`, and `HACK` markers
- Running in parallel with 5 other mapper instances via `@parallel-coordinator`

**Example usage:**
```
@mapper Write .codebase/CONVENTIONS.md. Read actual source files to identify naming
        patterns, import style, error handling, and async patterns. Include file:line examples.
```

**Works with:** `@orchestrator` (coordinates parallel mapper runs), `@code-explorer` (complementary — explorer traces flows, mapper documents structure), `@writer` (writer may document narrative; mapper documents facts)

---

### @multi-repo-coordinator

The multi-repo coordinator manages change propagation across a microservice architecture. It reads the sub-repo registry from `.planning/config.json`, builds a dependency graph (upstream-api → downstream-consumer → gateway order), detects conflicts between concurrent service changes, and produces a per-repo CHANGE PLAN ordered by that graph. API contracts are defined first; implementation follows in dependency order so upstream services always deploy before their consumers.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Coordinating a feature that requires changes across two or more services
- Ordering deployments when an upstream API contract is changing
- Detecting which downstream consumers will break when a shared library bumps a major version
- Producing a CHANGE PLAN document that teams can use to coordinate their work

**Example usage:**
```
@multi-repo-coordinator The user-service is adding a `preferences` field to GET /users/:id.
                        Map which downstream consumers call this endpoint and produce
                        an ordered CHANGE PLAN.
```

**Works with:** `@architect` (defines contract-first change specs), `@coder` (implements changes per repo), `@tester` (verifies cross-repo integration)

---

### @orchestrator

The orchestrator coordinates multi-agent execution for feature delivery. At startup it reads STATE.md and the active PLAN.md, identifies the first incomplete step, delegates it to the appropriate specialist, waits for completion, marks progress, and advances to the next step. It enforces phase gating — execution only proceeds when DISCUSS.md and PLAN.md are confirmed. If a delegated agent fails after one retry, it escalates to the user with specific options rather than continuing silently.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Running `/fd-new-feature` to drive an end-to-end feature delivery cycle
- Enforcing the discuss → plan → execute → review phase state machine
- Coordinating error recovery when a specialist agent fails mid-execution
- Tracking plan progress and updating STATE.md after each step

**Example usage:**
```
@orchestrator Resume execution of the active plan. Read STATE.md to find the current
              phase. Delegate incomplete steps in order and mark each complete.
```

**Works with:** `@orchestrator` (executes plan steps), `@plan-checker` (validates plans before execution), `@parallel-coordinator` (delegates parallel waves)

---

### @parallel-coordinator

The parallel coordinator maximizes throughput by running independent work simultaneously in waves. At the start of every job it emits a WAVE TABLE — a formatted table showing every agent slot and its wave dependencies. It delegates agents by wave, waits for each wave to complete before advancing, and runs a merge protocol when parallel tracks touch overlapping areas. The standard wave structure is: Wave 1 (research + exploration), Wave 2 (architecture, serial), Wave 3 (implementation + tests), Wave 4 (review + security).

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Executing a plan where multiple tasks are provably independent of each other
- Running `@researcher` and `@code-explorer` simultaneously before `@architect` begins
- Running `@coder` and `@tester` in parallel from `@architect`'s contracts
- Resolving merge conflicts when two implementation tracks touched the same file

**Example usage:**
```
@parallel-coordinator Execute the PLAN.md using wave-based parallel execution.
                      Emit the WAVE TABLE first, then delegate agents wave by wave.
```

**Works with:** `@orchestrator` (delegates parallel waves to this agent), `@task-splitter` (produces the wave breakdown this agent executes), `@coder` + `@tester` (run in parallel in Wave 3)

---

### @performance-optimizer

The performance optimizer identifies and fixes performance bottlenecks using data, never intuition. It always measures before optimizing: Node.js profiler, `webpack-bundle-analyzer`, `EXPLAIN ANALYZE`, or Lighthouse depending on the target. It reports findings as before/after numbers. It never proposes a speculative optimization — only improvements justified by profiling output. It targets Core Web Vitals thresholds (LCP < 2.5s, FID < 100ms) and common patterns like N+1 queries and O(n²) algorithms.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Diagnosing slow API endpoints using `EXPLAIN ANALYZE` on the database queries
- Reducing JavaScript bundle size with `webpack-bundle-analyzer` or `source-map-explorer`
- Eliminating N+1 query patterns by building an index before loops
- Optimizing React render performance with `useMemo` and `React.memo`

**Example usage:**
```
@performance-optimizer The /api/orders endpoint is taking 2-3 seconds. Profile the database
                       queries and identify the bottleneck. Show before/after numbers.
```

**Works with:** `@coder` (implements optimizations once bottleneck is confirmed), `@tester` (writes benchmarks to verify improvement), `@reviewer` (checks that optimizations don't introduce bugs)

---

### @planner

The planner creates detailed, file-level implementation plans with an explicit user confirmation gate before any code is written. It reads ARCHITECTURE.md and existing conventions first, extracts both explicit and implicit requirements, orders steps by dependency (data models → schema → repository → service → API → tests → UI → docs), and flags risks. After presenting the plan it pauses and waits for the user to confirm before execution begins.

**Model:** `anthropic/claude-opus-4-5`

**Best for:**
- Planning any feature that spans more than two files before writing code
- Identifying architecture conflicts and unknowns that would block implementation
- Ordering implementation steps so foundation code is in place before dependent code
- Generating a plan that feeds directly into `@coder`'s execution

**Example usage:**
```
@planner Plan the implementation of JWT refresh tokens. Read .codebase/ARCHITECTURE.md.
         List every file that needs to change and the order to change them.
         Pause for my confirmation before we proceed.
```

**Works with:** `@architect` (provides interface contracts and ADRs that feed the plan), `@coder` (executes the confirmed plan), `@planner` (alternative for structured FlowDeck plan format)

---

### @refactor-guide

The refactor guide changes code structure without changing observable behavior. It requires a green test suite before starting and verifies the suite stays green after every single transformation. Each transformation is committed independently with a `refactor:` prefix — never batched. It stops immediately if a test breaks and looks for a smaller step. It covers extract-function, rename, move-module, inline-variable, and similar low-risk catalog transforms, ordered from lowest to highest risk.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Extracting functions from files over 50 lines or 800 lines
- Eliminating code duplication by identifying and extracting shared logic
- Renaming variables and functions that no longer reflect their purpose
- Preparing a module for a new feature by reducing its complexity first

**Example usage:**
```
@refactor-guide Refactor src/services/order-service.ts. It's 600 lines with several
                large functions. Extract into smaller functions. Keep all tests green.
                One commit per transformation.
```

**Works with:** `@tester` (confirms suite is green before and after each step), `@coder` (applies transformations), `@mapper` (identifies refactoring candidates across the codebase)

---

### @researcher

The researcher finds accurate, cited information before anyone writes code. It searches Context7 first for up-to-date library documentation, then vendor docs, then package registries. Every fact is paired with its source URL. It never cites StackOverflow as a primary source and never fabricates API documentation — if it cannot find an authoritative source, it says so explicitly. Output follows a structured format covering "what it is", "how to use it", and "gotchas".

**Model:** `openai/gpt-4o`

**Best for:**
- Documenting an unfamiliar library's API before `@coder` uses it
- Comparing two libraries (e.g., `zod` vs `joi`) with concrete tradeoffs cited from official sources
- Finding the correct pagination API, error response format, or auth flow for an external service
- Identifying breaking changes between library versions that affect the implementation plan

**Example usage:**
```
@researcher Document the Stripe Checkout API for subscription billing. Cover: session creation,
            webhook event types, and how to handle failed payments. Cite official Stripe docs.
```

**Works with:** `@coder` (receives research output before implementation), `@architect` (uses library capability research to inform interface design), `@parallel-coordinator` (runs in parallel with `@code-explorer` in Wave 1)

---

### @reviewer

The reviewer checks code for correctness, security, and adherence to project conventions. It reads full files — not just the diff — to understand call context. It applies an 80% confidence threshold before flagging an issue: speculation is not a finding. Findings are classified as CRITICAL, HIGH, MEDIUM, or PASS. It checks for hardcoded credentials, SQL injection, XSS, missing auth middleware, improper error handling, and convention violations.

**Model:** `google/gemini-2.5-flash`

**Best for:**
- Reviewing a pull request before it is merged
- Checking a feature for security issues before it reaches staging
- Verifying that implementation matches the original plan and interface contracts
- Running in parallel with `@security-auditor` for a comprehensive pre-deploy check

**Example usage:**
```
@reviewer Review the diff in src/routes/payments.ts. Check for injection vulnerabilities,
          missing auth middleware, and convention adherence. Report by severity.
```

**Works with:** `@security-auditor` (runs in parallel for deeper security coverage), `@orchestrator` (receives review verdict and decides whether to advance phase), `@coder` (receives actionable findings and applies fixes)

---

### @security-auditor

The security auditor performs deep security audits against the OWASP Top 10. It checks for injection vulnerabilities (SQL, NoSQL, command, LDAP, template), broken access control (missing ownership checks, role bypasses), cryptographic failures (MD5/SHA1 for passwords, plaintext secrets), and dependency risks (known CVEs). It produces a PASS/FAIL report with severity classification and specific remediation steps. It does not apply fixes — that is `@coder`'s responsibility.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Auditing authentication and authorization code before merging security-sensitive PRs
- Scanning for hardcoded secrets and exposed API keys across changed files
- Checking dependency manifests for packages with known CVEs
- Producing a formal security report for compliance or handoff purposes

**Example usage:**
```
@security-auditor Audit src/auth/ for OWASP Top 10 vulnerabilities. Focus on A01 (access control)
                  and A02 (cryptographic failures). Return PASS or FAIL with severity classification.
```

**Works with:** `@reviewer` (parallel review partner), `@coder` (applies remediations after audit findings), `@orchestrator` (aggregates audit result into go/no-go decision)

---

### @task-splitter

The task splitter decomposes complex tasks into independent parallel workstreams. It reads a feature description or PLAN.md, builds a dependency graph, groups tasks into waves where each wave's work is provably independent, and emits a structured parallel execution plan that `@parallel-coordinator` can execute directly. Each track includes: assigned agent, target files, specific task, and a verifiable completion criterion.

**Model:** `anthropic/claude-sonnet-4-5`

**Best for:**
- Breaking a large feature into parallel workstreams before handing off to `@parallel-coordinator`
- Identifying which tasks must be serial (dependency gates) versus truly independent
- Sizing and scoping tasks so each fits within a single agent session
- Producing a wave plan when `@planner` is unavailable or overkill

**Example usage:**
```
@task-splitter Decompose the payment integration feature into parallel workstreams.
               Identify which parts can run simultaneously and which have dependencies.
               Produce a WAVE TABLE with agent assignments.
```

**Works with:** `@parallel-coordinator` (executes the wave plan produced by this agent), `@orchestrator` (uses task breakdown to coordinate execution), `@planner` (complementary — planner creates PLAN.md format, splitter focuses on parallelization)

---

### @tester

The tester writes tests that drive implementation using strict Red-Green-Refactor TDD. Tests are written before the code that makes them pass. Every test follows the Arrange-Act-Assert (AAA) pattern. It covers unit tests for isolated logic, integration tests for database and service interactions, and end-to-end tests for user-facing flows. For bug fixes, it writes a failing regression test before any fix is applied so the bug cannot silently recur.

**Model:** `anthropic/claude-haiku-4-5`

**Best for:**
- Writing a failing regression test to capture a reported bug before `@coder` fixes it
- Implementing the test suite for a new feature in parallel with `@coder` from interface contracts
- Running the full test suite as a verification step after `@refactor-guide` transforms
- Identifying coverage gaps and writing tests for uncovered paths

**Example usage:**
```
@tester Write failing tests for the UserService.create() method. Cover: happy path,
        duplicate email (conflict), and missing required fields (validation error).
        Use the AAA pattern with vitest.
```

**Works with:** `@coder` (implements code to make tests pass), `@debug-specialist` (writes regression test after root cause is identified), `@refactor-guide` (verifies green suite before and after each transformation)

---

### @writer

The writer drafts technical documentation that developers will actually read. It reads every source file it documents — never documents from memory. It favors accuracy over comprehensiveness, examples over prose, and active voice throughout. Documentation types covered: README.md (with standard section order), API reference (per-function with parameters, return types, and usage examples), changelogs (Keep a Changelog format), and ADRs. It marks anything it cannot verify as `UNKNOWN` rather than guessing.

**Model:** `anthropic/claude-haiku-4-5`

**Best for:**
- Writing a README.md from scratch for a new project or module
- Drafting API reference documentation for newly implemented public functions
- Creating a changelog entry after a release milestone
- Writing a code tour or architectural overview document

**Example usage:**
```
@writer Write a README.md for the payments module in src/payments/.
        Read the source files first. Include: purpose, quick start, API reference,
        and configuration options. Verify all examples compile.
```

**Works with:** `@doc-updater` (writer creates docs; doc-updater keeps them current), `@reviewer` (checks accuracy of written docs against implementation), `@code-explorer` (maps the codebase so writer has a structural overview before writing)

---

← [Back to Index](index.md)
