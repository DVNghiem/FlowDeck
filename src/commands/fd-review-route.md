---
description: Human Review Routing — route risky patches to the right reviewer type based on change nature and risk score
argument-hint: [change description or PR number]
---

# Review Route

Determine the right reviewer type for a proposed change based on its nature and risk.

**Input:** $ARGUMENTS — change description or PR number/URL

## Steps

1. Analyze the change described in `$ARGUMENTS`:
   - Read affected files and their categories
   - Check `.codebase/VOLATILITY.json` for risk scores if available
   - Check `.codebase/FAILURES.json` for prior failures in this area

2. Classify change by domain:

| Domain Signals | Reviewer Type |
|---------------|---------------|
| Auth, tokens, sessions, permissions | **Security reviewer** |
| DB migrations, schema, models | **Backend/DB reviewer** |
| Infrastructure, CI/CD, containers | **Infra reviewer** |
| Public APIs, SDK changes | **API owner** |
| High-churn or volatile file (score >0.7) | **Domain owner** |
| New external dependency | **Security + Arch reviewer** |
| Low risk, no sensitive paths | **Any peer reviewer** |

## Report

```
════════════════════════════════════════════
REVIEW ROUTING
════════════════════════════════════════════
Change: <summary>
Risk score: <0-10>

Recommended Reviewers:

  PRIMARY:   <reviewer type> — <reason>
  SECONDARY: <reviewer type> — <reason>

Why:
  - <specific signal that triggered routing>
  - <prior failures in this area if any>

SLA:
  - <high risk: same-day | medium: 24h | low: 48h>
════════════════════════════════════════════
```

If risk score < 3: "Low risk — any peer reviewer is sufficient."
