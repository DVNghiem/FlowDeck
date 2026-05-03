---
description: Risk assessment — estimates change risk, confidence, likely regressions, and whether approval is needed before proceeding
argument-hint: [change description]
---

# Evaluate Risk

Produce a risk assessment for a proposed change.

**Input:** $ARGUMENTS — description of the proposed change

## Steps

Run two agents in parallel:

- **@researcher**: Map `$ARGUMENTS` to affected paths and modules; check `.codebase/VOLATILITY.json` for hotspot scores; check `.codebase/FAILURES.json` for prior failures; identify external dependencies touched

- **@reviewer**: Validate the risk assessment — verify risk level is calibrated correctly given the scope; flag any under-estimated risks; check if approval is warranted by active policies in `.planning/config.json`

## Risk Dimensions

| Dimension | Weight | Assessment |
|-----------|--------|------------|
| Volatility | 30% | hotspot score of affected files |
| Blast radius | 25% | number of downstream dependents |
| Prior failures | 25% | recurrences in FAILURES.json |
| External deps | 20% | third-party APIs or services involved |

## Approval Logic

Approval required if:
- `approval_required: true` in config
- Overall risk score ≥ `volatility_threshold` (default 0.7)
- Any touched file has 3+ prior failures

## Report

```
════════════════════════════════════════════
RISK ASSESSMENT
════════════════════════════════════════════
Change: <summary>

Risk Score: <0.0–1.0> (<low|medium|high|critical>)
Confidence: <high|medium|low>

Breakdown:
  Volatility:    <score> (<rationale>)
  Blast radius:  <score> (<N downstream>)
  Prior failures: <score> (<N failures>)
  External deps: <score> (<list or none>)

Likely Regressions:
  - <category>: <reason>

Approval Required: <yes|no>
  <if yes: reason and who should approve>

Recommendation:
  <proceed | add tests | get review | redesign>
════════════════════════════════════════════
```
