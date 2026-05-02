---
name: plan-phase
description: "Orchestrates /plan-phase — delegates to flowdeck-planner then flowdeck-plan-checker"
triggers:
  - /plan-phase
steps:
  - name: delegate_to_planner
    agent: "@flowdeck-planner"
    action: Spawn flowdeck-planner agent to create PLAN.md
  - name: verify_plan_quality
    agent: "@flowdeck-plan-checker"
    action: Spawn flowdeck-plan-checker agent to verify plan completeness, feasibility, testability
  - name: present_results
    agent: "@orchestrator"
    action: Present results to user — PASS or FAIL with recommendations
---

# Plan Phase Workflow

## Purpose

Execute `/plan-phase [N]` to create a structured implementation plan using flowdeck agents.

## Process

### Step 1: Delegate to flowdeck-planner

Spawn flowdeck-planner agent with:
- ROADMAP.md (phase structure)
- REQUIREMENTS.md (requirements for this phase)
- PROJECT.md (project context)
- Phase number N

Agent will produce `.planning/phases/phase-N/PLAN.md`.

### Step 2: Verify Plan Quality

Spawn flowdeck-plan-checker agent to review PLAN.md:

**Completeness checklist:**
- [ ] All requirements mapped to tasks?
- [ ] Each task has clear scope?
- [ ] Dependencies clearly marked?

**Feasibility checklist:**
- [ ] Each task completable in one session?
- [ ] No circular dependencies?
- [ ] Tools/resources available?

**Testability checklist:**
- [ ] Success criteria observable?
- [ ] Can verify without running full system?
- [ ] Edge cases addressed?

### Step 3: Present Results

Return structured output:
```
## Plan Phase [N] Results

**Plan:** [plan name]
**Tasks:** [N] tasks in [waves] waves

### Verification
- [ ] PASS — Plan ready for execution
- [ ] FAIL — Issues found:

  ### Recommendations
  - [issue and fix recommendation]
```

### Step 4: On PASS

Update STATE.md:
- Set plan_file to `.planning/phases/phase-N/PLAN.md`
- Set plan_confirmed: true
- confirmed_at: [timestamp]

Output: "Plan ready. Run /execute-phase [N] to implement."

### Step 5: On FAIL

Return to user for decisions:
```
Plan not yet ready. Review findings above and:
- Type CONFIRM to proceed anyway (accept gaps)
- Type FIX to have flowdeck-planner revise the plan
- Describe specific changes needed
```

## Agent Configuration

| Agent | Model | Purpose |
|-------|-------|---------|
| flowdeck-planner | Sonnet 4.6 | Creates executable PLAN.md with task breakdown |
| flowdeck-plan-checker | Haiku 4.5 | Reviews plan quality before execution |

## Output Files

- `.planning/phases/phase-N/PLAN.md` — implementation plan
- `.planning/phases/phase-N/VERIFICATION.md` — checker output (if FAIL)
