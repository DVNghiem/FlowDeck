---
description: Close the task — summarize built vs required, then commit and push on confirmation
argument-hint: [--topic=<slug>]
---

# Done

Close the task: summarize what was built against what was asked, then commit and push.

**Input:** $ARGUMENTS — optional `--topic=<slug>` to target a topic other than the
active one.

## Step 0: Pre-flight

1. Check `~/.fd-plan/<slug>/STATE.md` exists. If not: `"No planning workspace. Run /fd-task first."`
2. Resolve `<topic>` from `--topic`, else from `topic` in STATE.md.
3. Read STATE.md via `planning-state action=read`. Record `status`, `plan_confirmed`,
   `blockers`, `steps_complete`.

## Step 1: Verify gate

`/fd-done` only runs after `/fd-verify` passed.

If `status != "verified"`:

```
❌ Cannot close — /fd-verify has not passed for "<topic>".

Run /fd-verify first. If it reported failures, fix them and re-run it.
```

The agent MUST stop. The agent MUST NOT commit and MUST NOT update state.

The agent MUST also stop if `blockers` is non-empty, listing each blocker.

## Step 2: Summarize built vs required

Read `~/.fd-plan/<slug>/<topic>/task.md` and check every requirement and acceptance
criterion against what actually landed.

Collect the changed files:

```bash
git diff --name-only HEAD
git log --oneline --no-merges <base>..HEAD
```

Present:

```
════════════════════════════════════════════════════
SUMMARY: <topic>
════════════════════════════════════════════════════

Requirements
  ✅ R-01: <requirement> — <where it landed>
  ✅ R-02: <requirement> — <where it landed>
  ⚠️  R-03: <requirement> — not implemented: <reason>

Acceptance Criteria
  ✅ <criterion>
  ⚠️  <criterion> — <gap>

Changed files: <N>
  <file 1>
  <file 2>
════════════════════════════════════════════════════
```

The agent MUST report gaps honestly. A requirement that was dropped or deferred MUST be stated
as such. The agent MUST NOT quietly omit it.

## Step 3: Ask for the commit message

Propose one in Conventional Commits form, derived from `task.md`:

```
Proposed commit message:

  <type>: <description>

  <body — what changed and why>

Use this message, edit it, or type SKIP to stop without committing.
```

**Wait for the user.** The agent MUST NOT proceed until the user responds.

## Step 4: Ask about pushing

```
Push to remote? (yes / no)
Branch: <current branch> → <remote>/<branch>
```

**Wait for the user.** The agent MUST NOT proceed until the user responds.

If the current branch is the default branch, the agent MUST say so and offer to create a
topic branch first. The agent MUST NOT commit directly to it.

## Step 5: Slop check

Before committing, run a slop scan on the diff to catch AI-generic artifacts:

```bash
git diff HEAD~1 -- . 2>/dev/null | grep -iE "improving|enhancing|robust|comprehensive|leveraging|utilizing|pivotal|seamless|tailored|streamline|cutting-edge|deliverable|game.?changer|revolutioni|foster|unparalleled|bespoke" || true
```

Also check for:
- Lines over 500 characters (AI tends to produce verbose output)
- Generic praise phrases in commit messages (never use "excellent work", "great job", "nice improvement")
- Placeholder or template artifacts (TODO markers, `[REVIEWER NOTE]`, `[STEP 1]`, etc.)

If slop is found:

```
⚠️  SLOP DETECTED — commit contains AI-generic artifacts:

  <list the specific findings>

Options:
  [1] Proceed anyway — ship it
  [2] Abort — let me clean it up first
```

**Wait for the user.** The agent MUST NOT proceed until the user responds.

If the user picks [2], the agent MUST stop here. Do not commit.

If no slop found, or user picks [1], proceed to Step 5b.

## Step 5b: Execute commit

On confirmation:

```bash
git add <changed files>
git commit -m "<confirmed message>"
```

Then, if the user approved a push:

```bash
git push -u origin <branch>
```

Report the resulting commit SHA and, on push, the remote ref.

If the user declined either step, say exactly what was and was not done.

## Step 6: Update project architecture

Re-read `~/.fd-plan/<slug>/architecture.md`.
Compare with actual changes made (from affect.md + completed steps).
If the task introduced new modules, changed tech stack, added dependencies, or
shifted architectural conventions → update the relevant sections.
The agent MUST NOT rewrite the whole file. The agent SHALL make surgical updates only.
Log: "Updated ~/.fd-plan/<slug>/architecture.md with changes from <topic>."

## Step 7: Close out state

```
planning-state action:update
  status: complete
  last_action: "<topic> closed via /fd-done"
  next_action: "run /fd-task to start the next task"
```

Update `~/.fd-plan/<slug>/checkpoint.json`, merging into the existing file:

```json
{
  "current_command": "fd-done",
  "current_stage": "complete",
  "status": "done",
  "topic": "<topic>",
  "saved_at": "<ISO timestamp>"
}
```

## Step 8: Report

```
════════════════════════════════════════════════════
✅ DONE — <topic>
════════════════════════════════════════════════════

  Requirements met:  <N>/<M>
  Changed files:     <N>
  Commit:            <sha> | not committed
  Pushed:            <remote>/<branch> | no

  State:             ~/.fd-plan/<slug>/STATE.md  ← status: complete

────────────────────────────────────────────────────
Next: /fd-task to start the next task
════════════════════════════════════════════════════
```

## Error Handling

- `STATE.md` not found → error with `/fd-task` as the remedy
- `status != "verified"` → the agent MUST block and point at `/fd-verify`
- Blockers present → the agent MUST list them all. The agent MUST NOT close.
- `git commit` fails → report the git error verbatim. The agent MUST NOT mark the task complete.
- `git push` fails → the commit stands; report the push failure and leave state complete

No partial state writes. Either the gates pass and state is written, or nothing is.
