# FlowDeck Best Practices

Maximize the efficiency and safety of your AI-driven development by following these best practices.

---

## 1. Spec-Driven Discipline

**Don't skip the planning phase.** FlowDeck strictly enforces phase gating to prevent agents from writing code before requirements are finalized.
- Use `/fd-discuss` to capture edge cases and constraints early.
- Use `/fd-plan` to break complex features into manageable waves.
- **Tip**: If you must make an emergency edit, run `/fd-settings` to temporarily advance the phase to `execute`, but remember to return to `plan` if you are still designing.

## 2. The Power of the Council

When faced with ambiguity, don't rely on a single agent.
- Use `/fd-council` for high-level design choices.
- The synthesis provided by the council often catches security or performance risks that a role-based implementation agents might miss.

## 3. Grounding with Hierarchical Context

AI agents perform better when they have clear, localized context.
- Keep an `AGENTS.md` file in each major directory.
- Use `context-generator` to keep these files up to date with your current `ROADMAP.md` and `STATE.md`.
- Include "Forbidden Paths" and "Tech Stack" details to prevent agents from using incompatible libraries.

## 4. Reliable Edits

In multi-agent sessions, files can change rapidly.
- Encourage your agents to use `fd-hash-edit`.
- By anchoring edits to specific content hashes, you eliminate the "stale line" problem where an agent overwrites a change made by another agent seconds earlier.

## 5. Failure Replay as a Learning Loop

When a bug is fixed, use the failure replay engine.
- FlowDeck records failure patterns to suggest new policies.
- **Tip**: Regularly review `/fd-dashboard` to see recurring failure zones and add them to `.codebase/CONSTRAINTS.md` to prevent future regressions.

## 6. Infrastructure & Environment Health

Before running a heavy implementation wave (e.g., `/fd-new-feature`):
- Run `/fd-doctor` to ensure all plugins and MCPs are active.
- Check the **Context Window Monitor** in your session logs. If you are above 80% usage, run a checkpoint and start a fresh session to avoid context truncation.

---

← [Back to Index](index.md)
