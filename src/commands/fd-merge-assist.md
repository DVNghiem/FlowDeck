---
description: Start a human-in-the-loop selective merge workflow to bring a specific feature from one branch to another
argument-hint: [feature description or source branch]
---

# Merge Assist

Bring a specific feature from one branch to another using selective cherry-pick or manual port, with mandatory human confirmation at every gate.

**Input:** $ARGUMENTS — feature description, source branch name, or both (e.g., "OAuth login from feature/oauth")

## Pre-flight

1. Verify this is a git repository. If not, error:
   > "This command requires a git repository."

2. Parse $ARGUMENTS to identify:
   - **Feature description** — what is being moved
   - **Source branch** — where it currently lives
   - **Target branch** — where it should land (default: current branch or `main`)

   If $ARGUMENTS is ambiguous, ask:
    > "Which branch contains the feature you want to bring?"
    > "Which branch should it land on?"

## Credential Safety

The agent MUST NOT ask for GitHub tokens, passwords, SSH keys, or any authentication secrets.

If a step requires remote authentication (e.g., `git push`, `gh pr create`):
1. Explain that the step requires authentication
2. Offer three options:
   - **Stop** — end the workflow here; the human can finish manually
   - **Defer** — complete local steps only; skip remote steps
   - **Manual** — the human runs the remote step themselves
3. Do NOT ask for credentials, tokens, or passwords

## Process

### Step 1: Start Session

Use the `merge-assist` tool with action `start`:
```json
{
  "action": "start",
  "targetBranch": "<target>",
  "sourceBranch": "<source>",
  "featureDescription": "<description>"
}
```

If branches do not exist, report the error and stop.

### Step 2: Branch Selection Gate

Present the session details and ask for confirmation:
> "Merge Assist: bring '<description>' from `<source>` → `<target>`.
> Confirm these branches? (y/n)"

Use `merge-assist` action `confirm` with `step: "branch_selection"` and `approved: true/false`.

If rejected, offer to abort or correct branch names.

### Step 3: Inspect Commits

Use `merge-assist` action `inspect` with the session ID.

Present candidate commits:
```
Found <N> candidate commit(s) on <source> not in <target>:

SHA       | Subject                 | Author | Files | Confidence
----------|-------------------------|--------|-------|------------
<sha-1>   | feat: add OAuth         | alice  | 3     | high
<sha-2>   | refactor: extract auth  | alice  | 2     | medium
```

Highlight dependent commits if detected.

### Step 4: Commit Selection Gate

Ask the user to select commits:
> "Which commits represent the feature? Provide SHAs (space-separated) or say 'all'.
> Include dependent commits? (y/n)"

Record the selection. Use `merge-assist` action `confirm` with `step: "commit_selection"`.

### Step 5: Build Plan

Use `merge-assist` action `plan` with `selectedCommits`.

Present the plan:
```
Merge Plan
----------
Integration branch: <branch-name>
Method: <cherry-pick | cherry-pick-range | manual-port>
Commits: <sha-1> <sha-2> ...
Risks:
  - <risk-1>
  - <risk-2>
```

### Step 6: Planning Gates

Confirm each planning detail:

1. Integration branch name:
   > "Use integration branch `<branch>`? (y/n)"
   → `confirm` with `step: "integration_branch"`

2. Merge method:
   > "Use method `<method>`? (y/n)"
   → `confirm` with `step: "method_selection"`

3. Dependencies:
   > "Include dependent commits? (y/n)"
   → `confirm` with `step: "dependency_inclusion"`

If any gate is rejected, offer to revise or abort.

### Step 7: Execute Gate

Present the recommended commands:
```bash
Recommended commands:
  git fetch origin
  git checkout -b <branch> <target>
  git cherry-pick <sha-1> <sha-2>
  git push -u origin <branch>
  gh pr create --base <target> --head <branch> ...
```

Ask:
> "Execute these commands? (y/n)"
→ `confirm` with `step: "execute_plan"`

**Important:** The agent MUST NOT execute these commands. Only the human should run them.

### Step 8: Handle Conflicts (if any)

If the human reports a conflict:

1. Stop the workflow.
2. Explain which file/commit caused the conflict.
3. Use `multiChoiceConfirm` to offer options:
   - "Show conflict details"
   - "Attempt resolution"
   - "Switch to manual port"
   - "Abort session"
4. Wait for human decision.

### Step 9: Push / PR Gate

After successful execution:
> "Push the branch and open a PR? This step requires GitHub authentication. (y/n)"

If the user is unsure about authentication or says no:
> "Remote push/PR requires authentication. Options:
> 1. Stop here — the integration branch is ready locally
> 2. Defer — skip push/PR for now
> 3. Manual — run `git push` and `gh pr create` yourself when ready"

→ `confirm` with `step: "push_pr"`

### Step 10: Complete

If `push_pr` is approved, mark the session complete:
> "Merge Assist complete. Branch `<branch>` pushed. PR created."

## Aborting

At any point, the user can abort. Use `merge-assist` action `abort` with the session ID.

## Error Handling

- Branch not found: report which branch is missing, offer to list branches
- No candidate commits: report that the source branch has no unique commits vs target
- No commits selected: error "At least one commit must be selected"
- Session not found: error "Session <id> not found. Start a new session with `start`"
