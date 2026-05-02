---
name: git-release
description: Create consistent releases and changelogs from merged PRs. Proposes semantic version bump, drafts release notes, and provides a copy-pasteable release command.
origin: FlowDeck
---

# Git Release Skill

Creates releases with consistent versioning, accurate changelogs, and proper tagging.

## When to Activate

Activate when:
- A milestone is complete and ready to ship
- You need to cut a release tag
- You need to generate a CHANGELOG entry

## Core Principles

- Semver strictly: major.minor.patch
- Conventional commits drive the version bump automatically
- Changelog is for humans: group by type, use plain language
- One release per tag — no force-pushing tags

## Workflow

1. **Collect commits** — `git log [last-tag]..HEAD --oneline`
2. **Determine version bump** from commits:
   - Breaking change (`!` or `BREAKING CHANGE:`) → major bump
   - `feat:` → minor bump
   - `fix:`, `refactor:`, `perf:` → patch bump
   - `docs:`, `test:`, `chore:` → no version bump (unless last release)
3. **Draft changelog** — group commits by type
4. **Update CHANGELOG.md** — prepend new version under `## Unreleased`
5. **Tag and push** — provide the exact commands

## Conventional Commits Types

| Type | Version Bump | Description |
|------|-------------|-------------|
| `feat` | minor | New feature |
| `fix` | patch | Bug fix |
| `perf` | patch | Performance improvement |
| `refactor` | patch | Code change, no behavior change |
| `docs` | none | Documentation only |
| `test` | none | Adding or updating tests |
| `chore` | none | Maintenance, dependencies |
| `ci` | none | CI/CD configuration |
| `feat!` or `BREAKING CHANGE:` | major | Breaking API change |

## Changelog Format

Follow Keep a Changelog (keepachangelog.com):

```markdown
## [1.2.0] — 2024-01-15

### Added
- User authentication via JWT (feat: add JWT auth)
- Password reset via email (feat: add password reset)

### Fixed
- Token expiry calculation was off by one day (fix: correct token expiry)

### Changed
- Migrated from bcrypt to argon2 for better security (refactor: use argon2)
```

## Release Commands

```bash
# After updating CHANGELOG.md
git add CHANGELOG.md
git commit -m "chore(release): v1.2.0"
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin main --tags
```

## Output Format

```markdown
## Release Proposal: v[X.Y.Z]

**Version bump**: patch | minor | major
**Reason**: [breaking change / new feature / bug fix]

### CHANGELOG entry (copy into CHANGELOG.md):
[formatted changelog section]

### Release commands:
```bash
[copy-pasteable commands]
```
```
