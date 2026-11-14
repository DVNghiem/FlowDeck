---
name: fd-review
description: Review FlowDeck task artifacts for premise, design, edge cases, and verification before execution
disable-model-invocation: true
argument-hint: "[topic]"
---

# FlowDeck review

Review the plan before code changes. `$ARGUMENTS`, when present, selects a topic; validate it against the topic directories reported by `state.mjs status`. Otherwise use the active topic. Do not infer the planning directory from the repository basename.

## 1. Load and validate inputs

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" status [topic]` from the project root. Read active lifecycle status, verification, tier, checkpoint, and artifact presence. Stop with a specific `/flowdeck:fd-task` remedy if state or required artifacts are missing.

- All tiers require `task.md` with requirements, acceptance criteria, constraints, and inline steps.
- STANDARD may omit `affect.md`; when present, include it in review.
- FULL requires `task.md`, `architecture.md`, `affect.md`, and `plan.md`.
- Existing tasks with all four files remain valid regardless of current tier metadata.

Read the project-level architecture document and relevant repository source. Inspect FDX impact/graph only after confirming `fdx --version`; otherwise trace imports/references manually and state the gap. Load relevant repo-memory/review lessons if the plugin or available local artifacts provide them. Do not claim access to OpenCode-only repo-memory or `fdx-validate` tools in Claude Code.

## 2. Challenge the premise (CEO lens)

Answer directly:

1. Is this the right problem, and what happens if nothing changes?
2. Is the approach the simplest one that meets the acceptance criteria? Which parts are speculative or can be cut?
3. Is the risk justified by the expected outcome? What is the worst realistic failure?
4. Is scope complete and bounded? What critical requirement is missing?

## 3. Challenge the design (engineering lens)

Check architecture against observed repository conventions, not guesses. Look for unnecessary abstractions, boundary violations, missing validation, incompatible schema/API changes, and failure handling. Check edge cases and partial failure. Confirm every acceptance criterion has a verification method. Compare affected-file lists against imports/callers; use FDX only when available. Flag file overlaps incorrectly classified as parallel.

For FAST, inspect inline mini-plan, acceptance criteria, reversible risk, and targeted checks; no independent agent is mandatory. For STANDARD, review risk and affected scope, and ask a mapper/planner only when it materially helps and delegation is available. For FULL, obtain an independent reviewer before execution; use security review for security-sensitive scope. Do not fabricate an independent review if no separate reviewer actually ran.

Classify each finding as **blocking** (implementation could be wrong, unsafe, or unverifiable) or **advisory**. Give concrete evidence, affected requirement/file, and a suggested correction. Do not edit source code during review.

## 4. Report and approval

Present both lenses, blockers, advisories, acceptance-criterion coverage, and acknowledged uncertainty. For FULL, ask the user to type `CONFIRM` to accept artifacts or describe revisions. Do not proceed past blockers unless fixed or the user explicitly accepts the risk. FAST/STANDARD should only ask for approval where the task has a meaningful user-owned decision; do not invent a blanket pause.

Record accepted advisory decisions in the task artifacts. If revisions are requested, update the affected planning artifact, then repeat the relevant review checks. Capture durable lessons only when a real lesson mechanism is available; otherwise include them in the report rather than claiming persistence.

## 5. Persist and hand off

Only after the required approval, set `plan_confirmed` to true using `state.mjs set plan_confirmed true`, update `last_action` and `next_action`, then save `state.mjs checkpoint fd-review complete`. Preserve existing checkpoint fields. For a UI task, record design approval only when it was explicitly given. If saving fails, report the failure and do not claim the review was persisted.

Report topic, tier, blockers/advisories, changes to artifacts, accepted risks, and next step `/flowdeck:fd-execute`. Do not begin implementation in this skill.
