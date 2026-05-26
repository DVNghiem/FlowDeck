# /fd-new-feature

**Purpose:** Define a new feature, initialize feature context in the current phase directory, and guide the user through the discuss-plan-execute-verify workflow.

## Usage

/fd-new-feature [feature name or description]

## What Happens

1. **Pre-flight checks.**
   - Verify `.planning/` exists (error if not found)
   - Read `STATE.md` to determine current phase number N

2. **Capture feature description.**
   - If no arguments provided, ask the user to describe the feature
   - Use the provided description as the feature name/summary

3. **Initialize feature context.**
   - Create `.planning/phases/phase-<N>/FEATURE.md` with phase, timestamp, status (defined), description, and placeholder fields for acceptance criteria and out-of-scope

4. **Update STATE.md.**
   - Set `feature` to the feature name
   - Set `status` to `defined`
   - Set `last_action` to record the feature initialization

5. **Present next steps.** Report the created file and the ordered workflow:

```
Next steps (in order):
  1. /fd-discuss          — capture requirements, scope, and acceptance criteria
  2. /fd-plan             — create implementation plan from discussion decisions
  3. /fd-execute          — run TDD pipeline to implement the plan
  4. /fd-verify           — run full test + review + deploy-check pipeline
```

## Output / State

File created:
- `.planning/phases/phase-<N>/FEATURE.md`

STATE.md updates:
```yaml
phase: <N>
status: defined
feature: <feature name>
last_action: "Feature defined: <feature name>"
```

## Examples

```
/fd-new-feature user authentication
```

Initializes a feature "user authentication" in the current phase and creates `FEATURE.md`.

```
/fd-new-feature
```

Prompts for a feature description if no arguments are given.

## Related Commands

- `/fd-discuss` — capture requirements and decisions for this feature
- `/fd-plan` — create implementation plan from discuss decisions
- `/fd-execute` — run TDD pipeline to implement the feature
- `/fd-verify` — run full verification after implementation
