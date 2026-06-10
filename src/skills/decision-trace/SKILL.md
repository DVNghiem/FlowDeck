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
    "agent": "backend-coder"
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

## Decision Evolution

Decisions are not static. They change as requirements shift, new evidence appears, or better alternatives emerge. Track the full lifecycle:

### `alternatives_considered`

List every option evaluated and why it was rejected or accepted. This prevents re-litigating old choices.

```json
"alternatives_considered": [
  "Use PostgreSQL full-text search (rejected: poor ranking for our use case)",
  "Add Elasticsearch (rejected: operational overhead exceeds benefit)",
  "Hybrid: Postgres for exact match, in-memory trie for prefix (accepted: best latency/cost tradeoff)"
]
```

### `superseded_by`

When a later decision replaces this one, link forward. This keeps the ledger from becoming stale.

```json
{
  "id": "cache-strategy-v1",
  "superseded_by": "cache-strategy-v2",
  "rationale": "Initial Redis caching for user sessions"
}
```

When querying, always check if an entry has `superseded_by` set. If it does, read the newer decision instead.

### `evidence`

Link to anything that supports the decision:
- Commit hash where the change was made
- Test file that validates the behavior
- Benchmark result showing performance improvement
- Failure ID from `.codebase/FAILURES.json` that motivated the fix
- Document or RFC that defined the requirement

Evidence must be checkable. "I think this is faster" is not evidence. A benchmark output is.

### `confidence_level`

Rate how certain you are that this decision will hold:

| Level | Criteria | Action |
|-------|----------|--------|
| **high** | Clear requirement, strong evidence, reversible if wrong | Record and move on |
| **medium** | Some ambiguity, partial evidence, or moderate blast radius | Schedule review in 2 weeks |
| **low** | Guesswork, no evidence, high blast radius, or irreversible | Require second opinion before proceeding |

Set `confidence_level` honestly. A low-confidence decision is not bad — pretending it is high confidence is.

## Decision Quality Checklist

Before recording, verify the decision meets these standards:

- [ ] **Problem defined**: The problem or goal is stated in one sentence
- [ ] **Alternatives evaluated**: At least two options were considered
- [ ] **Evidence exists**: The decision is supported by a commit, test, doc, or failure record — not just opinion
- [ ] **Risks documented**: Known downsides are listed in `assumptions` or `alternatives_considered`
- [ ] **Reversibility noted**: If this is wrong, how hard is it to undo? (easy / moderate / hard)

If any box is unchecked, either gather the missing information or flag the decision as `confidence_level: low`.

## Reading the Decision Ledger

`.codebase/DECISIONS.jsonl` is append-only newline-delimited JSON. Query it with the `decision-trace` tool or standard tools:

### Querying by Dimensions

Use the tool's `query` action to filter:

```json
// All decisions touching auth files
{ "action": "query", "query": { "file_path": "src/services/auth.ts" } }

// All deletions (high-risk)
{ "action": "query", "query": { "change_type": "delete" } }

// All high-risk decisions from the last sprint
{ "action": "query", "query": { "risk_level": "high", "limit": 20 } }
```

### Identifying Patterns

Read the ledger periodically to spot trends:

- **Repeated decisions**: If the same `alternatives_considered` appears 3+ times, extract a convention or skill
- **Assumption drift**: If an `assumptions` entry is contradicted by later decisions, update the original or mark it `superseded_by`
- **Risk clustering**: Many `high` risk decisions in one module signals instability — consider a refactor or deeper review

### Decisions Needing Review

Flag entries for re-examination when:
- **Old**: Recorded > 90 days ago with `confidence_level: medium` or `low`
- **High risk**: `risk_level: high` with no linked `evidence`
- **No evidence**: Empty `evidence` array and `confidence_level` is not `high`
- **Superseded chain**: A decision has `superseded_by` which itself has `superseded_by` — merge into a single current decision

## Tool Parameter Reference

The `decision-trace` tool accepts these actions:

| Action | Parameters | Description |
|--------|-----------|-------------|
| `record` | `entry` object (required) | Append a new decision to the ledger |
| `query` | `query` object with optional `file_path`, `change_type`, `risk_level`, `limit` | Search existing decisions |
| `get_for_file` | `file_path` (required) | Get all decisions for a specific file |

### Entry Schema

```typescript
interface DecisionEntry {
  id: string;                    // unique identifier
  file_path: string;             // file affected
  change_type: 'create' | 'edit' | 'delete' | 'refactor';
  rationale: string;             // why this change was made
  evidence: string[];            // supporting commits, tests, docs, failure IDs
  assumptions: string[];         // things assumed true
  alternatives_considered: string[]; // options evaluated
  risk_level: 'low' | 'medium' | 'high';
  confidence_level: 'low' | 'medium' | 'high';
  agent: string;                 // which agent made the decision
  superseded_by?: string;        // ID of a later decision that replaces this
}
```

## Cross-Reference

Use decision trace alongside these skills:

- **[change-impact-radar](../change-impact-radar/SKILL.md)**: Before recording a decision, run impact analysis to understand blast radius. Document the predicted impact in `assumptions`.
- **[arch-constraint-guard](../arch-constraint-guard/SKILL.md)**: If a decision violates a constraint, record it as `risk_level: high` with `confidence_level: low` and link to the constraint rule.

## Review Acceleration

When reviewing a PR, query DECISIONS.jsonl for all files in the diff. For each entry, reviewers can quickly see the "why" without asking the author.

## Guidance

- Rationale should answer: "why this approach and not the obvious alternative?"
- Evidence should be checkable: a doc URL, a failure ID, a test result
- Assumptions should be explicit: if an assumption breaks, so does the change
- Confidence should be honest: flag uncertainty so the team can allocate review attention
- Superseded decisions should be linked: prevent stale decisions from misleading future readers
