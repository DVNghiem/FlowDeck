# Design-First Workflow

FlowDeck enforces a design-first path for UI-heavy tasks by default.

## Trigger Conditions

Design-first is triggered when tasks mention user-facing work such as:
- landing page
- dashboard
- admin panel
- website redesign
- onboarding UX
- app screen/mobile UI

Backend-only or infra-only tasks skip design-first.

## Workflow

```text
task intake
→ task classification
→ design discovery
→ UX structure
→ wireframe/layout planning
→ visual system definition
→ design review/approval
→ implementation handoff
→ frontend implementation
→ QA/review
```

## Commands

- `/fd-design --mode=draft`: produce design artifact and handoff
- `/fd-design --mode=review`: compare implementation to approved design artifact
- `/fd-design --mode=system`: create/update token and component consistency guidance

## Design Artifact Schema

Each design run should persist:
- `task_type`
- `user_goals`
- `target_audience`
- `core_user_flows`
- `page_map_or_screen_map`
- `section_structure`
- `layout_plan`
- `component_list`
- `state_list`
- `responsive_behavior_notes`
- `visual_direction`
- `design_tokens_guidance`
- `accessibility_notes`
- `implementation_handoff_checklist`
- `approval_status`

## Example: Landing Page

```yaml
task_type: landing-page
user_goals:
  - understand value in <10 seconds
  - complete signup CTA
core_user_flows:
  - hero -> social-proof -> pricing -> CTA
layout_plan:
  - hero_section: headline, subheadline, primary_cta, secondary_cta
  - proof_section: logos, testimonials
  - pricing_section: tier_cards, comparison_table
state_list: [loading, empty, error, success]
approval_status: approved
```

## Example: App Screen Redesign

```yaml
task_type: app-screen
target_audience:
  - returning mobile users
core_user_flows:
  - home -> quick-action -> detail -> completion
section_structure:
  - top_nav
  - summary_cards
  - task_list
  - persistent_action_bar
responsive_behavior_notes:
  - compact_nav_on_small_screens
  - collapse_secondary_panels_under_768
design_tokens_guidance:
  - spacing_scale: [4, 8, 12, 16, 24, 32]
  - text_scale: [12, 14, 16, 20, 24]
approval_status: approved
```
