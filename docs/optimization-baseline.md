# FlowDeck Optimization Baseline

Captured on 2026-05-07 before deep optimization implementation.

## Dispatch Baseline

- Command: `bun test src/tools/agent-dispatch.test.ts`
- Result: 8 passing, 0 failing
- Suite runtime (bun): 135ms
- Wall clock runtime: 0.17s

## Observability Baseline

- `.codebase/` does not exist yet in a clean repo checkout.
- Telemetry hooks emitted `status: "ok"` for all tool completions and did not classify failures.
- Session/run IDs defaulted to `session-0` and `run-0` when runtime env variables were not set.

## Routing and Cost Baseline

- Dispatch tools did not call model routing or agent performance tracking.
- `src/services/model-router.ts` and `src/services/agent-performance.ts` were present but not wired into `delegate`/`run-pipeline`.
