# /fd-plan

**Purpose:** Create a detailed implementation plan from confirmed DISCUSS.md decisions — research-first, saves PLAN.md, updates STATE.md, and requires CONFIRM before saving.

## Usage

/fd-plan [--phase=N] [--yes]

## What Happens

1. **Research gate (before writing any plan).**
   - CodeGraph intelligence check (`codegraph action=check`)
   - If indexed and fresh: use `codegraph_context`, `codegraph_explore`, `codegraph_impact`
   - If unavailable: standard research pass reading STATE.md, DISCUSS.md, ARCHITECTURE.md, CODEBASE_INDEX.md
   - Reuse persisted research if fresh (within 5 minutes), otherwise run fresh pass and persist results
   - Invoke configured MCP tools for library/API/external knowledge as needed

2. **Guard check — D-06 compliance.**
   - Verify DISCUSS.md exists — error if not found
   - Verify DISCUSS.md is confirmed — error if not yet confirmed
   - Abort with clear remediation in both cases

3. **Load context.**
   - Read PROJECT.md, STATE.md, and the current phase's DISCUSS.md

4. **Draft plan.**
   - Tasks trace to D-XX decisions from DISCUSS.md
   - Each task includes `<action>` referencing relevant D-XX decisions
   - Wave assignments for parallel execution
   - File dependencies between tasks

5. **Validate plan.**
   - All requirements from ROADMAP.md for the current phase addressed
   - All D-XX decisions from DISCUSS.md traced in tasks
   - No tasks contradict prior decisions
   - Return to Step 4 to revise if validation fails

6. **Review plan.** Present draft to user showing tasks, D-XX traces, wave structure, and file dependencies.

7. **PAUSE for CONFIRM.**
   - Present: "Ready to save PLAN.md? Type CONFIRM to save, or describe changes needed."
   - If user types CONFIRM → proceed to Step 8
   - If user requests changes → return to Step 4 with feedback

8. **Save PLAN.md** to `.planning/phases/phase-<N>/PLAN.md` and commit with message `docs(phase-N): save confirmed plan`

9. **Update STATE.md.**
   - Set `plan_file` to the saved path
   - Set `plan_confirmed: true`
   - Set `last_action: "Plan confirmed"`
   - If UI-heavy task: set `requires_design_first: true` and `design_stage: pending`
   - Suggest `/fd-design --mode=draft` if design-first is required

## Output / State

File created:
- `.planning/phases/phase-<N>/PLAN.md`

STATE.md updates:
```yaml
plan_file: ".planning/phases/phase-<N>/PLAN.md"
plan_confirmed: true
last_action: "Plan confirmed"
requires_design_first: true   # if UI-heavy
design_stage: pending          # if UI-heavy
```

## Examples

```
/fd-plan
```

Creates a plan for the current phase using confirmed DISCUSS.md decisions.

```
/fd-plan --phase=2 --yes
```

Creates a plan for phase 2 and skips the confirmation pause.

## Related Commands

- `/fd-discuss` — capture decisions before planning
- `/fd-execute` — run TDD pipeline to implement the plan
- `/fd-design` — draft UI designs if the feature is UI-heavy (required before execute if `requires_design_first: true`)
