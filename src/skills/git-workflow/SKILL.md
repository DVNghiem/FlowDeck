---
name: git-workflow
description: Branching strategies, conventional commits, PR templates, and merge vs rebase guidance. Activate when starting features, creating PRs, or managing releases.
origin: FlowDeck
---

# Git Workflow Skill

Clean, reviewable git history. Small commits, descriptive messages, reviewed before merge.

## When to Activate

Activate when:
- Starting a new feature or bug fix
- Creating a pull request
- Managing a release
- Resolving merge conflicts

## Core Principles

- **Small, atomic commits** — one logical change per commit
- **Descriptive messages** — reader understands the change without reading the diff
- **Linear history preferred** — rebase local branches before creating PR
- **Review before merge** — no self-merges on shared branches

## Branch Naming Convention

```
feature/user-authentication      — new features
fix/login-redirect-loop          — bug fixes
chore/update-dependencies        — maintenance
release/v1.2.0                   — release preparation
hotfix/critical-null-dereference — urgent production fixes
refactor/extract-auth-middleware — code restructuring
docs/update-api-reference        — documentation only
```

## Conventional Commits Format

```
type(scope): description

[optional body]

[optional footer]
```

### Types
| Type | Version Bump | When to Use |
|------|-------------|-------------|
| `feat` | minor | New feature for the user |
| `fix` | patch | Bug fix for the user |
| `perf` | patch | Performance improvement |
| `refactor` | patch | Code change, no behavior change |
| `docs` | none | Documentation only |
| `test` | none | Adding or fixing tests |
| `chore` | none | Dependencies, tooling, CI |
| `ci` | none | CI/CD configuration |
| `build` | none | Build system changes |

### Examples

```
feat(auth): add JWT token refresh endpoint
fix(auth): correct token expiry off-by-one error
perf(db): replace N+1 query with single JOIN
refactor(user): extract password validation to separate module
docs(api): document authentication endpoints
test(auth): add coverage for token expiry edge cases
chore(deps): update express to 4.18.2
ci(github): add node 20 to test matrix
feat!: remove deprecated v1 API endpoints
```

### Breaking Changes

```
feat!: remove deprecated getUserData() function

BREAKING CHANGE: getUserData() has been removed.
Use fetchUserProfile() instead.
Migration: replace all calls to getUserData() with fetchUserProfile().
```

## PR Template

**Title**: Same format as a commit: `feat(auth): add password reset`

**Description**:
```markdown
## What
[What this PR does in 1-3 sentences]

## Why
[Why this change is needed]

## How to Test
1. [Step 1]
2. [Step 2]
3. Expected result: [what should happen]

## Checklist
- [ ] Tests added or updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] Ran `npm test` locally
```

## Rebase vs Merge

| Situation | Strategy | Command |
|-----------|---------|---------|
| Local feature branch before PR | Rebase | `git rebase main` |
| PR integration to main | Merge (preserves history) | GitHub "Merge PR" |
| Small feature PR | Squash merge | GitHub "Squash and merge" |
| Long-lived branch | Merge (preserves branch history) | `git merge --no-ff` |
| Force-push to shared branch | Never | — |

```bash
# Before creating PR — rebase to clean up
git fetch origin
git rebase origin/main
git push --force-with-lease    # safe force push (only if no one else pushed)
```

## Release Process

```bash
# 1. Create release branch
git checkout -b release/v1.2.0

# 2. Update version
npm version minor                # updates package.json + creates tag

# 3. Update CHANGELOG
# (add entry under ## [1.2.0])

# 4. Commit
git add CHANGELOG.md package.json
git commit -m "chore(release): v1.2.0"

# 5. Tag
git tag -a v1.2.0 -m "Release v1.2.0"

# 6. Push
git push origin release/v1.2.0 --tags

# 7. Create PR → merge → done
```

## Git Commands Reference

```bash
# Undo last commit (keep changes staged)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Fix commit message
git commit --amend -m "new message"

# Squash last 3 commits
git rebase -i HEAD~3

# Cherry-pick a commit to another branch
git cherry-pick [commit-sha]

# Find when a bug was introduced
git bisect start
git bisect bad                  # current is broken
git bisect good [good-sha]      # last known good

# Stash changes
git stash                       # save
git stash pop                   # restore
```
