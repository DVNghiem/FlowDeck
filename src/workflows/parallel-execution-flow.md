---
name: parallel-execution-flow
description: "Wave-based parallel agent execution — analyze → assign waves → execute wave 1 → execute wave 2 → merge → review"
steps:
  - name: analyze
    agent: "@parallel-coordinator"
    action: Read PLAN.md, identify all tasks, classify each as blocking or independent
  - name: assign_waves
    agent: "@parallel-coordinator"
    action: Group tasks into waves based on dependency graph, emit WAVE TABLE
  - name: execute_wave_1
    agent: "@researcher + @code-explorer"
    action: Run discovery tracks simultaneously — research external APIs, map unfamiliar code
  - name: execute_wave_2
    agent: "@architect"
    action: Design interfaces and produce ADR using Wave 1 findings — serial, gates Wave 3
  - name: execute_wave_3
    agent: "@coder + @tester"
    action: Implement code and write tests in parallel from @architect contracts
  - name: merge
    agent: "@parallel-coordinator"
    action: Compare file sets from Wave 3 tracks, detect overlaps, run conflict resolution if needed
  - name: review
    agent: "@reviewer + @security-auditor"
    action: Validate code quality and security simultaneously, log non-blocking issues
---

# Parallel Execution Flow

## Purpose

Executes a PLAN.md using the wave-based parallel model. Maximizes agent throughput by running independent tracks simultaneously while respecting dependency gates between waves.

## When to Use

- A PLAN.md has tasks that can be classified as independent of each other
- Estimated sequential time exceeds 30 minutes
- Tasks span research, design, implementation, and testing — roles that don't share files

## Wave Architecture

The flow organizes work into four standard waves. Not every job needs all four — omit waves with no work.

```
Wave 1: Discovery
  @researcher ──────────────────────┐
  @code-explorer ───────────────────┤ (parallel)
                                    ▼
Wave 2: Architecture            [gate: wait]
  @architect ───────────────────────┐ (serial)
                                    ▼
Wave 3: Implementation          [gate: wait]
  @coder ───────────────────────────┤
  @tester ──────────────────────────┤ (parallel)
                                    ▼
Wave 4: Validation              [gate: wait]
  @reviewer ────────────────────────┤
  @security-auditor ────────────────┘ (parallel)
```

Each wave gate waits for all **blocking** slots in the wave to complete before the next wave starts. Independent failures in a wave are retried asynchronously without blocking the gate.

## Step-by-Step Execution

### Step 1: Analyze

`@parallel-coordinator` reads PLAN.md and produces:
- A task list with estimated duration per task
- Dependency classification: which tasks block others
- Slot assignment: which agent handles each task

If PLAN.md is missing or unconfirmed, abort:
```
Error: No confirmed PLAN.md found.
Run /plan to produce a plan, then re-run this flow.
```

### Step 2: Assign Waves

`@parallel-coordinator` groups tasks into waves and emits the WAVE TABLE:

```
╔══════════════════════════════════════════════════════════════╗
║  WAVE TABLE — [Feature Name]                                 ║
╠══════════════════════════════════════════════════════════════╣
║  Wave 1 (parallel)  │ @researcher + @code-explorer          ║
║  Wave 2 (serial)    │ @architect                             ║
║  Wave 3 (parallel)  │ @coder + @tester                      ║
║  Wave 4 (parallel)  │ @reviewer + @security-auditor         ║
╠══════════════════════════════════════════════════════════════╣
║  Blocking locks:    │ W3 blocked on W2; W4 blocked on W3    ║
╚══════════════════════════════════════════════════════════════╝
```

Print this before spawning any agents. It is the execution contract for the job.

### Step 3: Execute Wave 1

Delegate to `@researcher` and `@code-explorer` simultaneously:

**@researcher brief:**
```
Task: [specific research objective]
Deliverable: .planning/research/[topic].md
Sources to check: [list]
Do NOT touch any source files.
```

**@code-explorer brief:**
```
Task: Map [module/directory] — produce a file inventory with function signatures
Deliverable: .codebase/[module]-map.md
Do NOT touch any source files.
```

Both briefs are sent at the same time. `@parallel-coordinator` waits for both to complete before Wave 2.

### Step 4: Execute Wave 2

Delegate to `@architect` with Wave 1 outputs attached:

**@architect brief:**
```
Task: [design objective]
Inputs:
  - Wave 1 research: .planning/research/[topic].md
  - Wave 1 code map: .codebase/[module]-map.md
Deliverables:
  - .planning/adr/[name].md
  - Interface contracts (TypeScript interfaces or equivalent)
Do NOT touch source files — contracts only.
```

`@parallel-coordinator` waits for `@architect` to complete before Wave 3.

### Step 5: Execute Wave 3

Delegate to `@coder` and `@tester` simultaneously using `@architect` output as the shared source of truth:

**@coder brief:**
```
Task: Implement [feature] per the interface contracts
Inputs:
  - Contracts: .planning/adr/[name].md
  - Research: .planning/research/[topic].md
Files to create/modify: [list]
Do NOT modify the contract file.
```

**@tester brief:**
```
Task: Write tests for [feature] per the interface contracts
Inputs:
  - Contracts: .planning/adr/[name].md  ← use this, not @coder output
Test file: [path]
Coverage target: all public interface methods + error paths
Do NOT read or depend on @coder's implementation files.
```

Both are sent at the same time. `@tester` works from contracts, not from `@coder`'s code, so they are truly parallel.

### Step 6: Merge

`@parallel-coordinator` compares Wave 3 outputs:

1. Collect file lists from `@coder` and `@tester`
2. Check for overlapping files
3. If no overlap: apply both, proceed to Wave 4
4. If overlap detected: classify (additive vs structural vs contradictory) and resolve per the conflict resolution protocol

Merge report format:
```
Wave 3 Merge Check
  @coder touched: src/auth/service.ts, src/auth/session.ts
  @tester touched: src/auth/service.test.ts
  Overlap: none ✅
```

If conflict:
```
Wave 3 Merge Check
  Overlap: src/types/user.ts
  Classification: Structural — incompatible interface definitions
  Resolution: delegating to @coder for sequential reconciliation
```

### Step 7: Review

Delegate to `@reviewer` and `@security-auditor` simultaneously:

**@reviewer brief:**
```
Review all files changed in Wave 3: [list]
Flag: logic errors, code style violations, missing error handling
Do NOT refactor — flag issues only.
```

**@security-auditor brief:**
```
Audit entry points and data flows in: [list]
Focus: injection surfaces, auth bypass paths, unvalidated inputs
Report all findings, severity-tagged.
```

Both are sent at the same time. Either may fail independently without blocking the other.

## Failure Recovery

| Failure Type | Action |
|-------------|--------|
| Blocking slot fails | Pause dependent downstream slots; retry with fallback brief |
| Independent slot fails | Log and continue; retry async after wave closes |
| Merge conflict detected | Invoke conflict resolution; re-run affected downstream slots |
| All slots in a wave fail | Abort job; report which wave failed and why |

## Output: Execution Summary

After all waves complete, `@parallel-coordinator` produces:

```markdown
## Parallel Execution Summary

Feature: [name]
Total elapsed: [time] (vs [sequential estimate] sequential)

| Wave | Agents | Status | Key Outputs |
|------|--------|--------|-------------|
| 1 | @researcher, @code-explorer | ✅ | research doc, code map |
| 2 | @architect | ✅ | ADR, contracts |
| 3 | @coder, @tester | ✅ | implementation, 14 tests |
| 4 | @reviewer, @security-auditor | ⚠️ | 2 issues filed; audit retry pending |

Conflicts resolved: 0
Files changed: [N]
Tests: [N passing]
```
