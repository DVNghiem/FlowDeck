---
name: fd-task
description: Define and plan a FlowDeck task from explicit input or the available conversation
disable-model-invocation: true
argument-hint: "[task description]"
---

# FlowDeck task

Create confirmed task artifacts and a tier-appropriate plan. Do not start implementation in this skill.

## 1. Establish task input

- If `$ARGUMENTS` is present, treat it as the task description; it takes precedence over inferred conversation details.
- Otherwise derive the request only from conversation context actually available in this session. Capture requirements, decisions, non-goals, acceptance criteria, and unresolved questions. Label each **confirmed**, **proposed**, or **unknown**, with brief provenance where possible.
- If unrelated tasks are present, ask which one to plan. If context is missing or truncated, say what is missing. Never present an inference as confirmed.
- Do not plan from an empty request. Ask for the task description and stop.

## 2. Route by risk

Set `workflowClass` in state to exactly `FAST`, `STANDARD`, or `FULL`.

- **FAST:** clear, reversible, local, low-risk work. No mandatory planner/reviewer and no extra preview when unambiguous. Put a short ordered mini-plan in `task.md`.
- **STANDARD:** ordinary changes. Put steps inline in `task.md`; add `affect.md` only when multiple files or meaningful shared impact justify it. Use specialists when discovery or ambiguity warrants it.
- **FULL:** authentication/authorization, security-sensitive behavior, database migration, public API/schema compatibility, critical concurrency, production/infrastructure changes, or genuinely high-impact cross-module work. Require all four artifacts, an explicit execution approval, and an independent review.

Uncertainty by itself does not force FULL. Ask one focused question or use STANDARD. Record why the selected tier fits.

## 3. Preview and research

For no-argument STANDARD and FULL tasks, show a concise preview of confirmed/proposed/unknown requirements and request one explicit confirmation **before discovery or planning**. Apply corrections to the preview; do not create a second planning flow. FAST may skip this only when the task is clear and reversible.

Research the codebase before proposing architecture. Inspect callers, tests, manifests, existing patterns, and relevant prior FlowDeck tasks. Use `fdx` only if it is installed and its documented CLI is available. Check `fdx --version`; if absent or broken, inspect files and references with ordinary shell/repository tools, state that graph/impact evidence is unavailable, and do not invent findings. External APIs that are unfamiliar or version-sensitive require current official documentation. Avoid unnecessary network searches for stable local facts.

Ask only material questions that codebase evidence cannot answer, one at a time. Skip and record questions answered by prior task artifacts, project architecture, repository conventions, or this conversation. Check for an existing component before proposing a duplicate.

## 4. Draft artifacts by tier

Write claims only when supported by research or a user answer.

### `task.md` (all tiers)

Include title, creation date, numbered requirements (`R-01`...), out-of-scope items, measurable acceptance criteria, constraints, open questions, and suppressed questions with the evidence that answered them. FAST and STANDARD include ordered inline implementation steps; every step names its check and files when known.

### `affect.md` (FULL, and justified STANDARD only)

Include affected files with create/modify/delete action, affected systems, risk (`low|medium|high`), and parallel safety. Put overlapping file ownership or dependent tasks in sequential order. If FDX is unavailable, mark impact as manually inspected and state its limits.

### `architecture.md` and `plan.md` (FULL only)

Architecture covers approach, components, data flow, and considered alternatives. Plan uses ordered waves and checkbox steps; every step traces to one or more `R-XX` requirements and names its files. Steps in one wave must have no dependency or file overlap. Every task appears exactly once in the parallel/sequential analysis.

Do not create placeholder optional artifacts. Existing legacy tasks with all four files remain readable.

## 5. Review and approval

For FULL, present the four drafts together with the risk and a rough effort estimate, then wait for the user to type `CONFIRM` or request revisions. Do not write planning artifacts or begin code before confirmation. For STANDARD/FAST, honor the earlier preview confirmation where required; do not add another approval gate unless a meaningful decision remains.

If the user requests revisions, update the draft and show the changed decision. Keep approvals specific to the stated scope.

## 6. Save state and artifacts

Resolve the planning root using `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" init <safe-topic-slug>` from the project root. Derive a lowercase ASCII slug with letters, digits, and hyphens; pass only that validated slug, never interpolate raw conversation text into a shell command. The output returns the canonical planning root and task path. This state lives under `~/.fd-plan/` using a canonical project-path hash; do not reconstruct the path from the project basename. If state initialization reports ambiguous legacy state, leave it untouched and report the manual migration issue.

Write only the required tier artifacts into the returned topic directory. Set the tier with `node "${CLAUDE_PLUGIN_ROOT}/scripts/state.mjs" set workflowClass FAST|STANDARD|FULL`. Keep lifecycle and verification separate; a newly planned task has lifecycle `planned` and verification `not_verified`.

Read back each written artifact. Validate completeness manually against this contract; Claude Code has no OpenCode `fdx-validate` tool. If a write or state command fails, report the error and do not claim the task was saved. Save a checkpoint with `state.mjs checkpoint fd-task complete`, preserving existing checkpoint fields.

## 7. Completion report

Report topic, tier, exact artifact paths, requirement count, unresolved questions, risk/impact basis, FDX availability, and whether the plan awaits a separate approval. Recommend `/flowdeck:fd-review` as the next command. Do not commit, push, deploy, or implement here.
