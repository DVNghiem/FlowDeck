# Spec-Driven Development (SDD) Workflow

This workflow enforces a strict separation between planning and execution.

## Phases

### 1. Discuss (Gated)
- Goal: Capture all requirements and architectural decisions.
- Tool: `/discuss`
- Restriction: **Write access to codebase is BLOCKED.**

### 2. Plan (Gated)
- Goal: Create a detailed implementation plan and acceptance criteria.
- Tool: `/fd-plan`
- Review: `/fd-plan --confirm` (User must approve)
- Restriction: **Write access to codebase is BLOCKED.**

### 3. Execute
- Goal: Implement the plan.
- Tool: `/fd-execute` (Orchestrator takes over)
- Restriction: Write access is ENABLED.

### 4. Review
- Goal: Verify implementation against acceptance criteria.
- Tool: `/review-code`

---
Strict enforcement ensures that AI agents don't start coding until the design is solid.

## Best Practices

### 1. Leverage the Council
For complex architectural decisions in the **Discuss** phase, use `/fd-council`. This runs multiple "hero" agents (Architect, Oracle, Reviewer) and provides a synthesized consensus.
- *Example*: `/fd-council "Should we use a relational or NoSQL database for the audit log?"`

### 2. Verify with Hash-Edits
When implementation starts in the **Execute** phase, ensure agents use `fd-hash-edit` for critical files. This prevents stale-line errors if multiple agents are working in the same area.

### 3. Maintain Context
Run `context-generator` at the start of each new phase to ensure `AGENTS.md` reflects the current roadmap and decisions. This helps sub-agents stay grounded.

### 4. Health Check
Run `/fd-doctor` before starting a major execution wave to ensure your environment and configuration are correctly set up.
