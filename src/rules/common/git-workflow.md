# Git Workflow

Conventional commits, clean history, and structured PR workflow.

## Conventional Commit Format

```
type(scope): description

[optional body — explain the why, not the what]

[optional footer — breaking changes, issue references]
```

All commits on the main branch must follow this format.

## Commit Types

| Type | Version Bump | When to Use | Example |
|------|-------------|-------------|---------|
| `feat` | minor | New feature | `feat(auth): add JWT refresh endpoint` |
| `fix` | patch | Bug fix | `fix(auth): correct token expiry calculation` |
| `perf` | patch | Performance | `perf(db): replace N+1 with single JOIN query` |
| `refactor` | patch | Restructure | `refactor(user): extract password validation` |
| `docs` | none | Documentation | `docs(api): document authentication endpoints` |
| `test` | none | Tests | `test(auth): add coverage for expired tokens` |
| `chore` | none | Maintenance | `chore(deps): update express to 4.18.2` |
| `ci` | none | CI/CD | `ci(github): add node 20 to test matrix` |
| `build` | none | Build system | `build: switch to esbuild` |

### Breaking Changes

```
feat!: remove deprecated v1 authentication endpoints

BREAKING CHANGE: The /api/v1/auth/* endpoints have been removed.
Migrate to /api/v2/auth/* before upgrading.
See MIGRATION.md for details.
```

## Branch Naming

```
feature/user-authentication          — new features
fix/login-redirect-loop              — bug fixes
chore/update-dependencies            — maintenance
release/v1.2.0                       — release preparation
hotfix/critical-null-dereference     — urgent production fix
refactor/extract-auth-middleware     — restructuring
docs/update-api-reference            — docs only
```

## PR Workflow

1. Create branch from `main` with proper naming
2. Make small, atomic commits with conventional messages
3. Rebase onto latest `main` before creating PR
4. Create PR with descriptive title and description
5. Requires at least 1 reviewer approval
6. All checks must pass (tests, types, lint)
7. Merge via squash merge for small features, regular merge for large ones

## Rebase vs Merge

| Situation | Use | Command |
|-----------|-----|---------|
| Local feature before PR | Rebase | `git rebase origin/main` |
| PR → main | Squash (small features) or Merge (large) | GitHub UI |
| Release branch | Merge with `--no-ff` | `git merge --no-ff release/v1.2.0` |
| **Never** | Force-push to main | — |

## Commit Hygiene

- **Atomic commits** — one logical change per commit
- **No WIP commits** on shared branches
- **Fix typos** by amending the last commit (`git commit --amend`), not a new commit
- **No "fix build" commits** — fix locally, amend, and force-push the feature branch
