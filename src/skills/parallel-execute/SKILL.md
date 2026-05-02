---
name: parallel-execute
description: Coordinate parallel agent execution for independent workstreams. Assign tasks to specialist agents by wave, merge outputs, handle conflicts. Use when a plan has parallel tasks.
origin: FlowDeck
---

# Parallel Execute Skill

Maximizes throughput by running independent work simultaneously. Manages waves, verifies independence, handles merge conflicts.

## When to Activate

Activate when:
- A plan has tasks that can run simultaneously
- Multiple independent features need to be implemented
- Research can happen in parallel with implementation

## Core Principles

- Parallel = different files + no shared state + not dependent on each other
- Always wait for an entire wave before starting the next
- Conflicts mean the tasks weren't truly independent — reassign as sequential
- Brief each agent completely — they are stateless

## Workflow

1. **Identify Wave 1** — tasks with no dependencies
2. **Verify independence** — confirm different files, no shared state
3. **Spawn Wave 1 simultaneously** — delegate all Wave 1 tasks at once
4. **Wait for all Wave 1** — do not start Wave 2 until all complete
5. **Check for conflicts** — compare files changed by each agent
6. **Spawn Wave 2** — tasks that depend on Wave 1 outputs

## Wave Structure Example

```
Wave 1 (start simultaneously — ~2 hours):
  Track A: @coder implements UserModel in src/models/user.ts
  Track B: @researcher documents bcrypt API for password hashing
  Track C: @tester writes tests for UserService in src/user.test.ts

[Wait for all three to complete]

Wave 2 (sequential — ~2 hours):
  Task 2.A: @coder implements auth service using outputs from Track A + B
  Task 2.B: @writer documents the public API using outputs from Track A

[Wait for 2.A and 2.B to complete]

Wave 3 (review — 30 min):
  @reviewer reviews all changes together
```

Timing example:
- Sequential total: 6.5 hours
- Parallel total: ~4.5 hours (30% faster)

## Independence Checklist

Before marking tasks as parallel:
- [ ] Task A and Task B touch different files
- [ ] Neither task's output is needed as input by the other
- [ ] Both tasks can be verified independently
- [ ] If both complete correctly, integration will be straightforward

## Conflict Resolution

If two agents modified the same file:

```
CONFLICT: Track A and Track C both modified src/types/user.ts
Resolution: Assigning @coder to reconcile both versions sequentially.
Track A change: [description]
Track C change: [description]
```

## Output Format

```markdown
## Parallel Execution Report

### Wave 1 Results (all must complete before Wave 2)
- Track A (@coder): ✅ src/models/user.ts created
- Track B (@researcher): ✅ bcrypt docs ready
- Track C (@tester): ✅ 8 tests written, 8 passing

### Conflicts
None detected.

### Wave 2 Starting
Task 2.A: @coder building auth service with Wave 1 outputs
```
