---
name: volatility-map
description: Highlight unstable zones of the repo based on commit churn, recent breakages, hotfix frequency, and unresolved TODO clusters.
origin: FlowDeck
---

# Codebase Volatility Map

Run `/volatility-map` to generate a heatmap of the most unstable parts of the codebase. Results are stored in `.codebase/VOLATILITY.json` for use by other FlowDeck features.

## Stability Levels

| Level | Score | Meaning |
|-------|-------|---------|
| stable | 0–19 | Low churn, no hotfixes, few TODOs |
| moderate | 20–49 | Some churn, occasional fixes |
| volatile | 50–79 | High churn or repeated hotfixes |
| critical | 80+ | Highest risk, most likely to break |

## Score Formula

`score = churn_commits + (hotfix_count × 10) + (todo_count × 2)`

## Data Collection Workflow

1. **Churn analysis** (git log, last 90 days):
   ```bash
   git log --since="90 days ago" --name-only --pretty=format: | sort | uniq -c | sort -rn
   ```
2. **Hotfix detection** (commit messages):
   ```bash
   git log --since="90 days ago" --pretty=format:"%s %H" | grep -i "hotfix\|revert\|urgent\|critical"
   ```
3. **TODO scan** (source files):
   ```bash
   grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" | cut -d: -f1 | sort | uniq -c
   ```
4. Write results to VOLATILITY.json via `volatility-map` tool

## How Other Features Use This

- **Patch Trust Score**: deducts points for volatile/critical files
- **Change Impact Radar**: flags volatile files in impact reports
- **Safe Execution Modes**: switches to `guarded` for volatile, `review-only` for critical
- **Human Review Routing**: escalates changes to volatile files to senior reviewers

## Refresh Schedule

Refresh the volatility map:
- Before any significant feature work
- After a production incident
- Weekly in active development periods
