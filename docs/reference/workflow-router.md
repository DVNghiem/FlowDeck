# Workflow Router API Reference

## Overview

The Workflow Router (`src/services/workflow-router.ts`) provides **adaptive workflow routing** for FlowDeck. It replaces the fixed pipeline (`discuss → plan → execute → review`) with a scoring-based system that selects the minimal sufficient workflow for each task.

## When to Use

Use the workflow router when:
- You need to select a workflow class based on task characteristics
- You want to score tasks across multiple dimensions (complexity, risk, confidence)
- You need to escalate from a lightweight workflow to a richer one
- You want to log routing decisions for observability

## Workflow Classes

| Class | Stages | When Selected |
|-------|--------|---------------|
| `quick` | `execute → verify` | Score ≥ 0.75 for simple/docs tasks |
| `standard` | `plan → execute → verify` | Default for normal implementations |
| `explore` | `discuss → plan → execute → verify` | Low confidence (< 0.60) or ambiguous tasks |
| `ui-heavy` | `discuss → design → plan → execute → verify` | UI/UX-heavy tasks |
| `bugfix` | `discuss → fix-bug → verify` | Bug signal dominates classification |
| `docs-only` | `write-docs → verify` | Documentation-only changes |
| `verify-heavy` | `plan → execute → verify` | High blast radius (≥ 5 files) or sensitive paths |

## Types

### `WorkflowClass`

```typescript
type WorkflowClass =
  | "quick"
  | "standard"
  | "explore"
  | "ui-heavy"
  | "bugfix"
  | "docs-only"
  | "verify-heavy"
```

### `RoutingCriteria`

Input data for the routing decision.

```typescript
interface RoutingCriteria {
  taskType: TaskType
  complexity: "cheap" | "standard" | "expensive"
  confidence: number        // 0.0–1.0
  blastRadius: number       // estimated files affected
  isSensitive: boolean      // touches auth/payment/infra paths
  codebaseFreshness: "fresh" | "stale" | "unknown"
  requiresTests: boolean
}
```

| Field | Type | Description |
|-------|------|-------------|
| `taskType` | `TaskType` | Classification from `quick-router.ts` |
| `complexity` | `"cheap" \| "standard" \| "expensive"` | From `model-router.ts` |
| `confidence` | `number` | Classification confidence (0.0–1.0) |
| `blastRadius` | `number` | Estimated number of files affected |
| `isSensitive` | `boolean` | Whether the task touches sensitive paths (auth, payment, etc.) |
| `codebaseFreshness` | `"fresh" \| "stale" \| "unknown"` | Whether `.codebase/` mapping is recent (< 24h) |
| `requiresTests` | `boolean` | Whether the task needs tests |

### `RoutingScore`

Score breakdown for a routing decision.

```typescript
interface RoutingScore {
  simplicity: number        // 0–0.30
  confidence: number        // 0–0.20
  lowRisk: number           // 0–0.20
  knownCodebase: number     // 0–0.15
  cheapComplexity: number   // 0–0.15
  total: number             // 0–1.0
}
```

### `WorkflowRoute`

The complete routing result.

```typescript
interface WorkflowRoute {
  workflowClass: WorkflowClass
  stages: WorkflowStage[]
  criteria: RoutingCriteria
  scores: RoutingScore
  reason: string
}
```

### `RoutingDecision`

Persisted routing decision with escalation history.

```typescript
interface RoutingDecision {
  route: WorkflowRoute
  escalationHistory: EscalationEvent[]
  skippedStages: string[]
  loggedAt: string
}
```

## Functions

### `scoreTaskForRouting`

Scores a task across 5 weighted dimensions.

```typescript
export function scoreTaskForRouting(criteria: RoutingCriteria): RoutingScore
```

**Scoring dimensions:**

| Dimension | Weight | Formula |
|-----------|--------|---------|
| Simplicity | 30% | `taskType === "simple" ? 1 : 0` |
| Confidence | 20% | `confidence` (raw value) |
| Low Risk | 20% | `!isSensitive && blastRadius < 3 ? 1 : 0` |
| Known Codebase | 15% | `codebaseFreshness === "fresh" ? 1 : 0` |
| Cheap Complexity | 15% | `complexity === "cheap" ? 1 : 0` |

**Example:**

```typescript
import { scoreTaskForRouting } from "@/services/workflow-router"

const criteria = {
  taskType: "simple",
  complexity: "cheap",
  confidence: 1.0,
  blastRadius: 1,
  isSensitive: false,
  codebaseFreshness: "fresh",
  requiresTests: false,
}

const score = scoreTaskForRouting(criteria)
// score.simplicity = 0.30
// score.confidence = 0.20
// score.lowRisk = 0.20
// score.knownCodebase = 0.15
// score.cheapComplexity = 0.15
// score.total = 1.00
```

### `buildAdaptiveStageSequence`

Selects the workflow class and stage sequence based on criteria.

```typescript
export function buildAdaptiveStageSequence(criteria: RoutingCriteria): WorkflowRoute
```

**Selection rules** (evaluated in order):

1. **Quick workflow**: `totalScore >= 0.75` AND (`taskType === "simple"` OR `taskType === "docs"`)
2. **Bugfix workflow**: `taskType === "bugfix"`
3. **Docs-only workflow**: `taskType === "docs"` AND `totalScore < 0.75`
4. **UI-heavy workflow**: `taskType === "ui-feature"`
5. **Verify-heavy workflow**: `blastRadius >= 5` OR `isSensitive`
6. **Explore workflow**: `confidence < 0.60` OR `taskType === "ambiguous"`
7. **Standard workflow**: default fallback

**Example:**

```typescript
import { buildAdaptiveStageSequence } from "@/services/workflow-router"

const route = buildAdaptiveStageSequence({
  taskType: "simple",
  complexity: "cheap",
  confidence: 1.0,
  blastRadius: 1,
  isSensitive: false,
  codebaseFreshness: "fresh",
  requiresTests: false,
})

// route.workflowClass = "quick"
// route.stages = [{ name: "execute", command: "fd-execute", skippable: true }, ...]
// route.reason = "Quick workflow: score 1.00 >= 0.75 for simple task"
```

### `shouldEscalate`

Determines if a workflow should escalate to a richer class during execution.

```typescript
export function shouldEscalate(
  currentClass: WorkflowClass,
  evidence: {
    blastRadius?: number
    isSensitive?: boolean
    testsFailing?: boolean
    designNeeded?: boolean
  },
): WorkflowClass | null
```

**Escalation rules:**

| From | To | Trigger |
|------|-----|---------|
| `quick` | `standard` | `blastRadius > 3` |
| `quick` | `standard` | `testsFailing` |
| `standard` | `verify-heavy` | `isSensitive` |
| `standard` | `verify-heavy` | `blastRadius >= 5` |
| `standard` | `ui-heavy` | `designNeeded` |

Returns `null` if no escalation is needed.

**Example:**

```typescript
import { shouldEscalate } from "@/services/workflow-router"

// During execution, more files are affected than expected
const newClass = shouldEscalate("quick", { blastRadius: 4 })
// newClass = "standard"
```

### `logRoutingDecision`

Appends a routing decision to `.codebase/WORKFLOW_ROUTING.jsonl`.

```typescript
export function logRoutingDecision(dir: string, decision: RoutingDecision): void
```

**Example:**

```typescript
import { logRoutingDecision, buildAdaptiveStageSequence } from "@/services/workflow-router"

const route = buildAdaptiveStageSequence(criteria)
const decision = {
  route,
  escalationHistory: [],
  skippedStages: ["discuss", "plan"],
  loggedAt: new Date().toISOString(),
}

logRoutingDecision("/path/to/project", decision)
// Appends JSON line to .codebase/WORKFLOW_ROUTING.jsonl
```

### `getHistoricalCompliance`

Reads historical stage compliance from `.codebase/SCORECARDS.jsonl`.

```typescript
export function getHistoricalCompliance(dir: string, taskType: TaskType): number | null
```

Averages the `stageCompliance` dimension from scorecard entries matching the given `taskType`. Returns `null` if no data exists.

**Example:**

```typescript
import { getHistoricalCompliance } from "@/services/workflow-router"

const compliance = getHistoricalCompliance("/path/to/project", "feature")
// compliance = 0.85 (or null if no scorecards)
```

## Integration

### With `quick-router.ts`

The `buildAdaptiveWorkflow()` function in `quick-router.ts` calls `buildAdaptiveStageSequence()` to replace the deprecated `buildStageSequence()`:

```typescript
// Old (fixed)
const stages = buildStageSequence("feature") // always returns discuss→plan→execute→verify

// New (adaptive)
const result = buildAdaptiveWorkflow(description, exploration)
// result.workflowClass = "quick" | "standard" | ...
// result.stageSequence = dynamically selected stages
```

### With `supervisor-binding.ts`

The supervisor reads `workflowClass` from `SupervisorContext` to apply conditional phase checks:

- `quick` / `docs-only` workflows skip the `fd-execute` phase check
- `quick` / `docs-only` workflows skip the UI-heavy design approval check

### With `planning-state-lib.ts`

New `PlanningState` fields track routing decisions:

```typescript
interface PlanningState {
  workflowClass?: string
  skippedStages?: string[]
  escalationHistory?: Array<{ from: string; to: string; trigger: string; reason: string; timestamp: string }>
  routingScores?: { simplicity: number; confidence: number; lowRisk: number; knownCodebase: number; cheapComplexity: number; total: number }
  routingReason?: string
}
```

## File Output

### `.codebase/WORKFLOW_ROUTING.jsonl`

Each routing decision is appended as a JSON line:

```json
{
  "route": {
    "workflowClass": "quick",
    "stages": [...],
    "criteria": { ... },
    "scores": { "simplicity": 0.30, "confidence": 0.20, "lowRisk": 0.20, "knownCodebase": 0.15, "cheapComplexity": 0.15, "total": 1.00 },
    "reason": "Quick workflow: score 1.00 >= 0.75 for simple task"
  },
  "escalationHistory": [],
  "skippedStages": ["discuss", "plan"],
  "loggedAt": "2026-06-02T04:30:00Z"
}
```

## See Also

- [`quick-router.ts`](../services/quick-router.md) — Task classification and stage sequencing
- [`model-router.ts`](../services/model-router.md) — Task complexity classification
- [`supervisor-binding.ts`](../services/supervisor-binding.md) — Policy enforcement
- [`planning-state-lib.ts`](../tools/planning-state-lib.md) — State management
