# /fd-execute

**Purpose:** Implement the current phase's plan using TDD discipline and a parallel agent pipeline — delegates to specialist agents via orchestrator, cycles through RED-GREEN-REFACTOR per step, and updates STATE.md throughout.

## Usage

/fd-execute [--phase=N] [--override]

## What Happens

1. **Research gate (before touching any code).**
   - CodeGraph intelligence check (`codegraph action=check`)
   - If indexed and fresh: use `codegraph_context` and `codegraph_impact`
   - Standard pre-flight: verify STATE.md freshness, check CODEBASE_INDEX.md for changes since plan was written
   - Reuse persisted research if fresh; run fresh pass and persist if stale
   - Verify design handoff is complete if `requires_design_first: true`

2. **Guard check.**
   - Verify `.planning/` and `.codebase/` exist
   - Verify `plan_confirmed: true` in STATE.md
   - Verify PLAN.md exists in current phase directory
   - If `requires_design_first: true`: require `design_stage: handoff_complete` and `design_approved: true` (or `--override` with logged reason)
   - Initialize TDD state (`stage: behavior`, `cycle: 1`)

3. **Load PLAN.md.** Parse tasks and identify which steps are already complete.

4. **TDD cycle per step** (repeat for each incomplete step):

   a. **Define behaviors** — spawn `@orchestrator` to generate behavior checklist from the step
   
   b. **RED** — spawn `@tester` to write failing tests (tests MUST fail before implementation)
   
   c. **Confirm RED** — run failing tests; block until tests fail
   
   d. **GREEN** — spawn appropriate implementation agent (`@backend-coder`, `@frontend-coder`, or `@devops`) to write minimum code to pass the failing tests
   
   e. **Confirm GREEN** — run tests; block until they pass; return to (d) if they fail
   
   f. **REFACTOR** — clean up code (only if GREEN); block if not GREEN
   
   g. **Verify** — run full test suite; revert refactoring if any test fails
   
   h. **Review step** — spawn `@reviewer` to check quality, security, TDD discipline, >= 80% test coverage
   
   i. **Update STATE.md** — mark step complete, increment TDD cycle
   
   j. **Refresh codegraph index** — run `codegraph action=refresh agent=fd-execute` after each source change

5. **Wave-based execution.** Wave 1 steps execute first; Wave 2 after Wave 1; Wave 3 after Wave 2. No intra-wave dependencies.

6. **Complete phase.**
   - Update phase status to `complete` in STATE.md
   - Update ROADMAP.md progress
   - Present completion summary

## Output / State

STATE.md per-step update:
```yaml
steps_complete: [1, 2]
steps_pending: [3, 4, 5]
last_action: "Step 2 TDD complete: [behavior] (RED→GREEN→REFACTOR)"
tdd:
  stage: behavior
  cycle: 2
  behaviors_completed: 2
```

STATE.md on full phase completion:
```yaml
status: complete
last_action: "Phase N TDD complete — all steps finished"
tdd:
  stage: complete
  cycles_used: N
  behaviors_completed: M
```

## Examples

```
/fd-execute
```

Run the TDD pipeline for all steps in the current phase's PLAN.md.

```
/fd-execute --phase=2
```

Execute phase 2's plan instead of the current phase.

```
/fd-execute --override
```

Override design-first requirement (with logged reason). Use sparingly.

## Related Commands

- `/fd-plan` — create the plan before executing
- `/fd-verify` — run full verification after execution
- `/fd-resume` — reload state and continue if execution was interrupted
- `/fd-checkpoint` — save checkpoint before a long execution session
