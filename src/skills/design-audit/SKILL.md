---
name: design-audit
description: Audit implemented UI against approved design artifacts for hierarchy, consistency, responsiveness, and accessibility fidelity
origin: FlowDeck
---

# Design Audit Skill

Use this skill to evaluate UI output against an approved design spec before final verification.

## When to Activate

- Post-implementation review for UI-heavy tasks
- `/fd-design --mode=review`
- Any feature where design fidelity is a release criterion

## Required Inputs

- Approved design artifact
- Implemented UI scope (screens/pages/components)
- Review rubric (if available)

## Output Format

- mismatches
- hierarchy_issues
- spacing_issues
- cta_flow_issues
- responsiveness_issues
- accessibility_issues
- component_consistency_issues
- missing_state_coverage
- verdict (pass/fail)

## Example

Use for: "Review dashboard implementation against approved wireframe and token rules."
