---
description: Start a human-in-the-loop selective merge workflow to bring a specific feature from one branch to another
argument-hint: [feature description or source branch]
---

# /fd-merge-assist

**Purpose:** Bring a specific feature from one branch to another using selective cherry-pick or manual port, with mandatory human confirmation at every gate.

## Usage

```
/fd-merge-assist [feature description or source branch]
```

## What Happens

1. **Verify git repository.** Errors if not inside a git repo.
2. **Identify feature and branches.** Parses the argument to determine the feature description, source branch, and target branch (defaults to current branch or `main`).
3. **Start a session.** Creates a merge session tracking the selected commits and branches.
4. **Select commits.** Lists candidate commits from the source branch that are not on the target and asks the user to select which ones to port.
5. **Cherry-pick or manual port.** Attempts cherry-picks; on conflict, offers to stop, defer, or switch to manual port.
6. **Push / PR gate.** After successful local merge, optionally pushes the branch and opens a PR. The agent never asks for credentials; the user runs remote steps themselves if desired.
7. **Complete or abort.** Reports the result and allows aborting at any point.

## Credential Safety

The agent never asks for GitHub tokens, passwords, or SSH keys. Remote authentication steps are deferred to the human.

## Output / State

- A merge session is tracked in planning state
- Local branch with selected commits applied
- Optional remote push/PR (human-driven)

## Examples

```
/fd-merge-assist "OAuth login from feature/oauth"
```

Starts a selective merge of the OAuth login feature from `feature/oauth` to the current branch.
