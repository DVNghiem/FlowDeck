# 01 — Add integration test for orchestrator prompt surgery

Type: task
Status: open
Triage: ready-for-agent

## Context

Plan-eng-review (D14) found that `tests/agents/orchestrator.test.ts` only string-matches prompt content. The new prompt adds `fdx-context append` after each `task()` call, `fdx-worktree merge` conflict-halt instruction, and "Recent context" inlining via `formatContextPacket`. None of this is unit-testable — the highest-risk surface (the LLM's runtime interpretation of the new prompt) is the least tested.

## Why

The /plan-eng-review review explicitly flagged this as P1-blocker. The PR ships an unprovable assumption: that the LLM will correctly interpret `fdx-worktree merge: {conflict: true}` and halt. Without an integration test, a regression in the prompt (e.g., someone removes the conflict-halt line) is invisible to CI.

## Pros

- Catches prompt regressions in CI before they reach production.
- Documents the expected LLM behavior with a fixture.

## Cons

- Requires recorded-output infrastructure (capture a real LLM call against a fixture task).
- Adds latency to the test suite.

## Where to start

1. Find existing recorded-output test infrastructure in flowdeck (check `tests/integration/` and `tests/agents/` for any LLM-call mocks or fixtures).
2. If none exists, design a small fixture: a `task` call against a stub agent, capture the LLM's response text + tool calls.
3. Add a test that runs the orchestrator prompt against the fixture, asserts the expected tool calls.

## Depends on / blocked by

- This PR (the 4 tools) must land first to provide the tool surface the prompt refers to.
