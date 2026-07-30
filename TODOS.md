# TODOS

## Agent Governance

### Add the remaining fdx-* tools to agent contracts

**What:** Extend `allowedTools` across all contracts in `src/services/agent-contract-registry.ts` to cover `fdx-read`, `fdx-search`, `fdx-grep`, `fdx-outline`, `fdx-tree`, `fdx-impact`, `fdx-batch`, `fdx-diff`, `fdx-git`, `fdx-ls`.

**Why:** All 13 contracts currently permit zero fdx tools, while every agent prompt instructs fdx-first. `src/services/agent-validator.ts:84` checks `contract.allowedTools.includes(ctx.toolUsed)`, and `:141` escalates a `tool-not-in-contract` warning to a hard block when the validator runs in `strict` mode. So strict mode is unusable today: every agent would be blocked from the tools its own prompt tells it to use.

**Context:** Found during the 2026-07-30 eng review of the codegraph → fdx-graph replacement (finding F6). Default mode is `advisory` (`agent-validator.ts:53`), so the gap is latent rather than breaking — violations are warnings and calls proceed. Nothing in the repo sets `strict`. That review added only `fdx-graph` to the 11 contracts, because it was the one tool the change made live; the rest were deliberately left out of scope. Start by reading the 11 contract entries and deciding per agent which read tools it legitimately needs — do not blanket-add all 10 to all 11, since `forbiddenActions` and role boundaries differ (e.g. `researcher` has `web-search`, the write-capable coders have `bash`). Whoever enables strict mode first will hit this wall.

**Effort:** M
**Priority:** P2
**Depends on:** None. Should land before anyone enables `governance.validator.mode: strict`.

### Create a contract entry for the mapper agent

**What:** Add a `mapper` entry to `src/services/agent-contract-registry.ts`.

**Why:** `mapper` is the only agent prompt with no registered contract, so `getContract("mapper")` returns undefined and `agent-validator.ts` emits a `no-contract` violation (severity `info`) on every tool call it makes. Its tool access is entirely unenforced.

**Context:** Found during the 2026-07-30 eng review (Issue 2). Contracts are keyed by names that do not match prompt filenames — the registry has `backend-coder`, `frontend-coder`, `devops`, `debug-specialist`, while `src/agents/` has `coder.ts`, `debug.ts`, `mapper.ts`. Eleven contracts exist for twelve agents; `mapper` is the missing one. It was deliberately not created during that review because `allowedTaskTypes` and `requiredInputs` need real design and designing a contract as a ride-along on a prompt sweep is how bad contracts get written. Start from the `architect` contract (`allowedTools: ["read", "glob", "grep"]`, read-only `forbiddenActions`) since mapper is also read-only in Explore mode, then add the graph and fdx read tools it actually needs. Note mapper writes one file under `~/.fd-plan/<slug>/.codebase/` in Document mode, so `forbiddenActions` cannot simply forbid all writes.

**Effort:** S
**Priority:** P3
**Depends on:** None. Worth doing alongside the fdx-* contract work above.

## Infrastructure

### Resolve tool-selection-policy.ts dead code

**What:** Delete `selectToolFamily` and its test file, or wire it to a real caller.

**Why:** ~110 lines of unreachable logic plus 14 test assertions that exercise only unreachable logic. It is also the last remaining code path that prefers codegraph over fdx-graph, so it reads as a live tool policy when nothing consults it.

**Context:** Found during the 2026-07-30 eng review (Issue 4). `grep -rn "selectToolFamily" src/` returns only its own definition at `src/services/tool-selection-policy.ts:94`; the sole other mention is a comment at `src/mcp/index.ts:54`. All real callers are in `tests/services/tool-selection-policy.test.ts`. It was flagged rather than deleted per the repo rule to mention unrelated dead code instead of removing it mid-task. Before deleting, check whether the `McpAvailability` and `McpName` types it exports are imported elsewhere — the types may be load-bearing even though the function is not. If wiring it up instead, note that its whole premise is MCP availability (`availability`, `codegraphReady`), which does not fit `fdx-graph` — fdx-graph is a local binary and always available, so the `code_graph_understanding` branch would need a redesign, not a rename.

**Effort:** S (delete) / L (wire up)
**Priority:** P3
**Depends on:** None.
