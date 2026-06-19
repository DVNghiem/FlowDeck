---
name: merge-assist
description: Human-in-the-loop selective branch integration via cherry-pick or manual port, with mandatory confirmation gates before each step.
origin: FlowDeck
---

# Merge Assist Skill

Selective, human-approved branch integration. Never auto-merge. Never auto-push.

## When to Activate

Activate when:
- The user wants to move a specific feature from one branch to another
- The user asks to cherry-pick selectively from a branch
- The user wants to avoid merging an entire branch (e.g., avoid bringing in unrelated changes)
- The user needs help porting commits across diverged branches
- The user says things like "bring this feature to main", "cherry-pick these changes", "port this PR"

## Core Principles

1. **Human approval is mandatory** — Every gate requires explicit y/n confirmation. No silent execution.
2. **Never assume feature boundaries** — Ask the user which commits represent the feature. Do not guess.
3. **Prefer selective methods** — Cherry-pick over full merge. Manual port over blind cherry-pick when conflicts are likely.
4. **Ask on every ambiguity** — If commit history is unclear, stop and ask. Do not proceed on assumptions.
5. **No autonomous merge authority** — The agent MUST NOT run `git merge`, `git cherry-pick`, `git push`, `git commit`, `git checkout`, `git branch -D`, `git reset`, or `git revert` without human confirmation.
6. **Never ask for credentials** — The agent MUST NOT ask for GitHub tokens, passwords, SSH keys, or any authentication secrets. If a remote action requires authentication, explain this and offer options: stop, defer, or let the human perform that step manually.

## Workflow Steps

### Step 1: Clarification

Ask the user to confirm:
- **Target branch** — where the feature should land (e.g., `main`)
- **Source branch** — where the feature currently lives (e.g., `feature/auth-refactor`)
- **Feature description** — one-sentence summary of what is being moved

If the user only provides a branch name, infer the other branch from context or ask.

Use the `merge-assist` tool with action `start` to create the session.

### Step 2: Branch Verification

The tool verifies both branches exist. If not, report the error and stop.

Confirmation gate: `branch_selection`

Prompt example:
> "Confirm: integrate feature 'OAuth login' from `feature/oauth` into `main`? (y/n)"

### Step 3: Inspection

Use the `merge-assist` tool with action `inspect` to analyze the source branch history.

The tool returns:
- Candidate commits (SHA, subject, author, date, files)
- Heuristic confidence for whether each commit is part of the feature
- Dependent commits detected via shared files or message keywords

Present the candidate commits to the user in a clear table:

```
SHA     | Subject                    | Author    | Confidence | Feature?
--------|----------------------------|-----------|------------|----------
abc1234 | feat(auth): add OAuth flow | alice     | high       | yes
def5678 | refactor(auth): extract  | alice     | medium     | maybe
```

### Step 4: Commit Selection

Ask the user to identify which commits represent the feature.

Confirmation gate: `commit_selection`

Prompt example:
> "Which commits represent the OAuth feature? Provide SHAs (space-separated) or say 'all'.
> Dependent commits detected: def5678. Include them? (y/n)"

### Step 5: Plan Creation

Use the `merge-assist` tool with action `plan` with the selected commits.

The tool builds a merge plan including:
- Recommended method: `cherry-pick`, `cherry-pick-range`, `manual-port`, or `abort`
- Integration branch name (default: `merge-assist/<source>-to-<target>`)
- Risk assessment
- Recommended commands (as strings — NOT executed)

### Step 6: Planning Confirmations

Three gates must be confirmed before proceeding:

1. **integration_branch** — Confirm the integration branch name
2. **method_selection** — Confirm the merge method
3. **dependency_inclusion** — Confirm whether to include dependent commits

Prompt example:
> "Integration branch: `merge-assist/feature-oauth-to-main`. OK? (y/n)"
> "Method: cherry-pick-range (commits abc1234..def5678). OK? (y/n)"
> "Include dependent commit def5678 (refactor prep)? (y/n)"

### Step 7: Execute Confirmation

Confirmation gate: `execute_plan`

Present the recommended commands to the user. Do NOT run them.

Prompt example:
> "Ready to execute. Recommended commands:
> ```
> git fetch origin
> git checkout -b merge-assist/feature-oauth-to-main main
> git cherry-pick abc1234^..def5678
> git push -u origin merge-assist/feature-oauth-to-main
> ```
> Execute these commands? (y/n)"

### Step 8: Human Execution

If approved, the human (or agent with explicit permission) runs the commands.

**The agent MUST NOT run these commands autonomously.**

### Step 9: Push / PR Confirmation

After successful execution, confirm pushing and PR creation.

Confirmation gate: `push_pr`

Prompt example:
> "Push branch and open PR? (y/n)"

## Confirmation Gates

Every gate requires human approval. The tool tracks each gate in the session state.

| # | Gate | Trigger | Prompt Style |
|---|------|---------|-------------|
| 1 | `branch_selection` | After start | y/n |
| 2 | `commit_selection` | After inspect | Provide SHAs + y/n on deps |
| 3 | `integration_branch` | During plan | y/n |
| 4 | `method_selection` | During plan | y/n |
| 5 | `dependency_inclusion` | During plan | y/n |
| 6 | `execute_plan` | After plan approved | y/n |
| 7 | `push_pr` | After execute | y/n |

If any gate is rejected:
- Stop the workflow
- Offer to `abort` the session or revise the selection

## Conflict Handling

If a conflict occurs during human execution:

1. **Stop immediately** — Do not proceed past the conflict.
2. **Explain the conflict** — File path, commit SHA, and what changed.
3. **Propose options** — Use `multiChoiceConfirm` with choices like:
   - "Show conflict details"
   - "Attempt resolution"
   - "Abort and try manual port"
   - "Abort session"
4. **Wait for human decision** — Do not auto-resolve. Do not guess.

Update the session with conflict info if available:
```
conflicts: [
  { file: "src/auth.ts", commitSha: "abc1234", description: "Both branches modified login() signature" }
]
```

## Anti-Patterns

The following are explicitly forbidden:

- **Auto-merge** — Never run `git merge` without confirmation
- **Auto-push** — Never run `git push` without confirmation
- **Assume commits** — Never guess which commits belong to a feature
- **Silent cherry-pick** — Never cherry-pick without showing the user what will happen
- **Ignore conflicts** — Never proceed past a conflict without human input
- **Skip confirmation gates** — Every gate must be explicitly approved or rejected
- **Execute state-changing git commands in the tool** — The tool only READS git history
- **Ask for credentials** — Never request GitHub tokens, passwords, SSH keys, or other secrets from the user

## Examples

### Example 1: Simple cherry-pick

User: "Bring the OAuth feature from feature/oauth to main"

Agent:
> "Starting merge-assist workflow. Target: `main`, Source: `feature/oauth`, Feature: OAuth login.
> Confirm: integrate from `feature/oauth` into `main`? (y/n)"

[User confirms]

Agent:
> "Found 3 candidate commits:
> - abc1234 feat(auth): add OAuth flow (high confidence)
> - def5678 refactor(auth): extract auth module (medium — shared files)
> - ghi9012 test(auth): add OAuth tests (medium — test only)
> Which commits represent the feature? (provide SHAs or 'all')"

[User selects abc1234 def5678]

Agent:
> "Plan: cherry-pick-range `abc1234^..def5678` into `merge-assist/feature-oauth-to-main`.
> Risks: refactor prep commit included.
> Execute? (y/n)"

### Example 2: Conflict detected

User: "It conflicted on src/auth.ts"

Agent:
> "Conflict detected in `src/auth.ts` during cherry-pick of `abc1234`.
> Options:
> 1. Show conflict details
> 2. Attempt resolution
> 3. Abort and try manual port
> 4. Abort session
> What would you like to do?"

## Tool Reference

Use the `merge-assist` tool with these actions:
- `start` — Initialize session
- `inspect` — Analyze git history
- `plan` — Build merge plan from selected commits
- `confirm` — Record approval/rejection for a step
- `abort` — Abort session
- `status` — Get current session state
- `list` — List all sessions
