---
name: decision-trace
description: Record why the agent changed something, what evidence was used, and what assumptions were made — so code reviews become much faster.
origin: FlowDeck
---

# Decision Trace

Every non-trivial edit should be recorded in `.codebase/DECISIONS.jsonl`. This creates an append-only audit trail that makes code review and debugging faster.

## When to Record a Decision

Record when:
- Editing a file that affects behavior (not just formatting/comments)
- Choosing between two or more implementation approaches
- Making an assumption about a requirement
- Fixing a bug or regression
- Changing an API contract or schema

## How to Record

Use the `decision-trace` tool:

```json
{
  "action": "record",
  "entry": {
    "id": "auth-refactor-2024-05-01",
    "file_path": "src/services/auth.ts",
    "change_type": "edit",
    "rationale": "Refactored token validation to use constant-time comparison to prevent timing attacks",
    "evidence": [
      "OWASP: timing attacks on string comparison",
      "Prior failure: auth-timing-2024-03 in FAILURES.json"
    ],
    "assumptions": [
      "Token format remains base64-encoded JWT",
      "Redis cache is available for token blacklist"
    ],
    "alternatives_considered": [
      "Keep string comparison (rejected: timing attack risk)",
      "Move validation to edge (rejected: adds latency)"
    ],
    "risk_level": "medium",
    "agent": "coder"
  }
}
```

## Automatic Recording

The `decision-trace-hook` auto-records a minimal entry for every write/edit. The full entry (with rationale, evidence, assumptions) should be added by the agent explicitly using the tool above.

## Querying Decisions

```json
// Get all decisions for a file
{ "action": "get_for_file", "file_path": "src/services/auth.ts" }

// Get all high-risk decisions
{ "action": "query", "query": { "risk_level": "high", "limit": 10 } }
```

## Review Acceleration

When reviewing a PR, query DECISIONS.jsonl for all files in the diff. For each entry, reviewers can quickly see the "why" without asking the author.

## Guidance

- Rationale should answer: "why this approach and not the obvious alternative?"
- Evidence should be checkable: a doc URL, a failure ID, a test result
- Assumptions should be explicit: if an assumption breaks, so does the change
