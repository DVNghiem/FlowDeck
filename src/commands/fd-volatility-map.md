---
description: Codebase Volatility Map — highlight unstable zones based on git churn, hotfix frequency, and TODO clusters. Updates .codebase/VOLATILITY.json
---

# Volatility Map

Generate a volatility map of the codebase to identify unstable, high-churn areas.

## Steps

Run three analyses in parallel:

### 1. Git Churn (@researcher)
```bash
git log --follow --format="%ad" --date=short -- <file> | wc -l
```
Run for all source files (last 90 days). Identify files with the most commits.

### 2. TODO/FIXME Scan (@researcher)
Scan all source files for `TODO`, `FIXME`, `HACK`, `XXX` comments. Count per file.

### 3. Hotfix Frequency (@researcher)
Search git log for commit messages containing `fix`, `hotfix`, `patch`, `urgent`, `bug` (last 90 days). Count per file touched.

## Scoring

For each file, compute a volatility score (0.0–1.0):
- `churn_score` = commits / max_commits (normalized)
- `todo_score` = todo_count / max_todos (normalized)
- `hotfix_score` = hotfix_commits / max_hotfixes (normalized)
- `volatility = (churn * 0.4) + (hotfix * 0.4) + (todo * 0.2)`

## Output

Write results to `.codebase/VOLATILITY.json`:
```json
{
  "generated_at": "<timestamp>",
  "hotspots": [
    { "path": "<file>", "score": 0.92, "commits": 47, "todos": 8, "hotfixes": 12 }
  ],
  "stable_zones": [
    { "path": "<file>", "score": 0.05 }
  ]
}
```

## Report

```
════════════════════════════════
VOLATILITY MAP
════════════════════════════════
Top Hotspots:
  🔴 <file> — score: 0.92 (47 commits, 12 hotfixes)
  🟠 <file> — score: 0.71 (23 commits, 5 hotfixes)
  🟡 <file> — score: 0.45 (15 commits, 8 TODOs)

Stable Zones:
  🟢 <file> — score: 0.05

Saved: .codebase/VOLATILITY.json
════════════════════════════════
```
