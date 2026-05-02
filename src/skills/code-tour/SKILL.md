---
name: code-tour
description: Creates guided code walkthroughs as structured markdown documents. Use when onboarding new developers, explaining architecture, or creating PR review guides.
origin: FlowDeck
---

# Code Tour Skill

Creates step-by-step walkthroughs of a codebase or code change. Makes complex code navigable.

## When to Activate

Activate when:
- Onboarding a new developer to the codebase
- Explaining a complex architecture to stakeholders
- Creating a PR review guide for a large change
- Documenting how a specific flow works (auth, billing, etc.)

## Core Principles

- **Audience-first** — write for someone unfamiliar with this code
- **Verified paths** — every file path and line number must be real and current
- **Why, not just what** — explain the design decisions, not just what the code does

## Workflow

1. **Identify audience** — new developer? tech lead? domain expert?
2. **Choose scope** — full codebase? single feature? specific PR?
3. **Read and verify** — read every file you will reference; confirm paths exist
4. **Write tour steps** — numbered, with file path, code snippet, explanation, and why
5. **Validate paths** — run `ls` on each referenced file to confirm it exists

## Tour Format

Each step follows this structure:

```markdown
### Step N: [What This Step Shows]

**File**: `src/path/to/file.ts` (lines 23-45)

```typescript
// paste the relevant code snippet here
```

**What it does**: [One or two sentences explaining the code]

**Why it's designed this way**: [The design rationale]

**What to notice**: [The most important thing to understand]
```

## Tour Types

| Type | Audience | Scope | Focus |
|------|---------|-------|-------|
| Onboarding | New developer | Full codebase | Entry points, key patterns, conventions |
| Architecture | Tech lead / stakeholder | System design | Component relationships, data flow |
| PR Review | Reviewer | Changed files | What changed, why, how to verify |
| RCA (Root Cause Analysis) | Team | Bug site | Call path, where it broke, why |

## Full Tour Template

```markdown
# Code Tour: [Title]

## Audience
[Who this tour is for]

## Scope
[What this tour covers]

## Prerequisites
- [What the reader should already know]

---

### Step 1: Entry Point

**File**: `src/index.ts` (line 1)
[code snippet]
[explanation]

### Step 2: [Next Concept]
[...]

---

## Summary

[2-3 sentences: what we walked through and what matters most]

## Next Steps

- [What to read next]
- [What to try next]
```

## Output

Save tours to `.codebase/tours/[topic].md` or `docs/tours/[topic].md`.
