---
description: Design-first workflow for UI-heavy tasks — draft design artifacts, review implementation fidelity, or define design system rules
argument-hint: [--mode=draft|review|system] [task-description] [--override]
---

# Design

Run design-first workflow stages for user-facing tasks.

**Input:** $ARGUMENTS — supports `--mode=draft|review|system` (default `draft`)

## Mode: draft

Use when creating/updating UI before implementation.

### Required Stages

1. discovery
2. UX planning
3. wireframe/layout planning
4. visual system definition
5. design approval
6. implementation handoff

### Process

1. Classify task as UI-heavy (landing page, dashboard, admin panel, app screen, website/app UX)
2. Delegate to `@design` agent for structured artifacts
3. Persist outputs in planning state under `design_artifact`
4. Mark:
   - `requires_design_first: true`
   - `design_stage: handoff_complete`
   - `design_approved: true` only when approval criteria are met
5. Record any bypass with explicit `design_override_reason`

## Mode: review

Use to review implemented UI against approved design artifact.

### Process

1. Load approved design artifact and changed UI files
2. Delegate to `@design` with `design-audit` + `responsive-review`
3. Report:
   - design mismatches
   - hierarchy/spacing issues
   - CTA flow weaknesses
   - responsive/accessibility concerns
   - missing empty/error/loading/success states

## Mode: system

Use to generate/update design tokens and component behavior rules.

### Process

1. Delegate to `@design` with `design-system-definition`
2. Generate/update token guidance and component rules
3. Save summary in planning state `design_artifact.design_tokens_guidance`

## Enforcement Notes

- UI-heavy tasks must complete design approval before `/fd-execute`, unless `--override` is explicitly provided and logged.
- Backend-only/infrastructure-only tasks skip this command.
