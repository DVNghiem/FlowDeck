---
description: Pre-change analysis — runs impact radar, blast radius, regression prediction, test gaps, volatility, and reviewer routing in one report
argument-hint: [change description]
---

# Analyze Change

Run a comprehensive pre-change analysis combining all intelligence tools into a single report.

**Input:** $ARGUMENTS — description of the proposed change

## Steps

Run all analyses in parallel:

1. **Impact Radar** — which files/APIs/tests are affected (see `/fd-impact-radar`)
2. **Blast Radius** — downstream consequences and hidden couplings (see `/fd-blast-radius`)
3. **Regression Predict** — most likely regression categories (see `/fd-regression-predict`)
4. **Test Gap** — coverage gaps to fill before implementing (see `/fd-test-gap`)
5. **Volatility** — check `.codebase/VOLATILITY.json` for hotspot scores on affected files
6. **Review Route** — who should review this change (see `/fd-review-route`)

## Consolidated Report

```
════════════════════════════════════════════════════
PRE-CHANGE ANALYSIS: "$ARGUMENTS"
════════════════════════════════════════════════════

IMPACT (<N> files affected)
  - <top 5 affected files with reason>

BLAST RADIUS (risk: <low|medium|high>)
  - <key downstream risks>

REGRESSIONS (top 3 risks)
  🔴 <category> — <reason>
  🟠 <category> — <reason>

TEST GAPS (<N> gaps found)
  - CRITICAL: <gap>
  - HIGH: <gap>

VOLATILITY
  Hot zones touched: <list or "none">

REVIEW ROUTING
  → <reviewer type> (<reason>)

────────────────────────────────────────────────────
RECOMMENDATION: <proceed | add tests first | redesign | review required>

Next steps:
  1. <most important action>
  2. <second action>
════════════════════════════════════════════════════
```
