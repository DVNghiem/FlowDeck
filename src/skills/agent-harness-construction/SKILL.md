---
name: agent-harness-construction
description: Build autonomous agent pipelines — construct agent loops, wire multi-agent orchestration, implement self-healing retry logic, and measure agent effectiveness
origin: FlowDeck
---

# Agent Harness Construction Skill

Constructs autonomous agent pipelines that can plan, execute, self-correct, and measure their own effectiveness.

## When to Activate

Activate when:
- Building multi-agent orchestration systems
- Implementing autonomous loops (self-correcting agents)
- Designing agent retry and self-healing policies
- Wiring agent-to-agent communication
- Measuring and optimizing agent effectiveness

## Agent Loop Architecture

### Core Loop Pattern

```
┌─────────────────────────────────────────────┐
│  1. OBSERVE    → Gather context state       │
│  2. THINK      → Plan next action           │
│  3. ACT        → Execute tool call          │
│  4. EVALUATE   → Check result quality       │
│  5. ADAPT      → Retry or proceed            │
└─────────────────────────────────────────────┘
```

```typescript
interface AgentLoop {
  observe: () => Promise<Context>;
  think: (ctx: Context) => Promise<Plan>;
  act: (plan: Plan) => Promise<Result>;
  evaluate: (result: Result) => Evaluation;
  adapt: (evaluation: Evaluation) => 'continue' | 'retry' | 'complete';
}
```

### Self-Healing Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, backoff = 'exponential', onRetry } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delay = backoff === 'exponential'
        ? Math.pow(2, attempt - 1) * 1000
        : attempt * 1000;
      onRetry?.(attempt, error as Error);
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}
```

## Multi-Agent Orchestration

### Supervisor Pattern

```typescript
interface AgentMessage {
  from: string;
  to: string;
  type: 'request' | 'response' | 'assign' | 'result';
  payload: unknown;
  traceId: string;
}

class SupervisorAgent {
  private agents: Map<string, Agent>;
  private messageQueue: AgentMessage[] = [];

  async assignTask(task: Task, targetAgent: string): Promise<Result> {
    const message: AgentMessage = {
      from: this.id,
      to: targetAgent,
      type: 'assign',
      payload: task,
      traceId: generateTraceId(),
    };
    return this.sendAndWait(message);
  }

  async assignParallel(tasks: Task[], agents: string[]): Promise<Result[]> {
    return Promise.all(
      tasks.map((task, i) => this.assignTask(task, agents[i % agents.length]))
    );
  }
}
```

### Council Pattern

Multiple agents deliberate and vote on a decision:

```typescript
interface CouncilMember {
  id: string;
  specialty: 'security' | 'performance' | 'correctness';
  vote: (proposal: Proposal) => Promise<Vote>;
}

interface CouncilDecision {
  votes: Vote[];
  decision: 'approve' | 'reject' | 'revise';
  consensus: number; // 0-1
}

async function councilDeliberate(
  proposal: Proposal,
  members: CouncilMember[]
): Promise<CouncilDecision> {
  const votes = await Promise.all(members.map(m => m.vote(proposal)));
  const approvals = votes.filter(v => v.approve).length;
  const consensus = approvals / votes.length;

  return {
    votes,
    decision: consensus >= 0.7 ? 'approve' : consensus >= 0.4 ? 'revise' : 'reject',
    consensus,
  };
}
```

## Agent Effectiveness Measurement

### Trace-Based Metrics

```typescript
interface AgentTrace {
  traceId: string;
  agentId: string;
  spans: {
    name: string;
    startTime: number;
    endTime: number;
    success: boolean;
    tokensUsed?: number;
    error?: string;
  }[];
  outcome: 'success' | 'failure' | 'timeout';
}

// Track effectiveness
function measureAgentEffectiveness(traces: AgentTrace[]): AgentMetrics {
  return {
    successRate: traces.filter(t => t.outcome === 'success').length / traces.length,
    avgDuration: traces.reduce((sum, t) => {
      const duration = t.spans[t.spans.length - 1].endTime - t.spans[0].startTime;
      return sum + duration;
    }, 0) / traces.length,
    avgTokensPerTask: traces.reduce((sum, t) =>
      sum + (t.spans.reduce((s, span) => s + (span.tokensUsed ?? 0), 0) / t.spans.length), 0
    ) / traces.length,
    retryRate: traces.filter(t => t.spans.some(s => s.name === 'retry')).length / traces.length,
  };
}
```

## Error Classification

```typescript
type ErrorCategory =
  | 'transient'     // Network blip, timeout — retry eligible
  | 'recoverable'   // Missing context, bad input — can fix with adaptation
  | 'fatal';        // Auth failure, permission — cannot proceed

function classifyError(error: Error): ErrorCategory {
  if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
    return 'transient';
  }
  if (error.message.includes('invalid input') || error.message.includes('missing context')) {
    return 'recoverable';
  }
  return 'fatal';
}
```

## Self-Healing Policies

```typescript
interface HealingPolicy {
  trigger: (error: Error) => boolean;
  action: (context: AgentContext) => Promise<Action>;
}

const healingPolicies: HealingPolicy[] = [
  {
    trigger: (e) => e.message.includes('rate limit'),
    action: async (ctx) => {
      ctx.throttleDelay = Math.min(ctx.throttleDelay * 2, 60000);
      return { type: 'backoff', delay: ctx.throttleDelay };
    },
  },
  {
    trigger: (e) => e.message.includes('context too long'),
    action: async (ctx) => {
      ctx.summarizeOlderHistory();
      return { type: 'compact' };
    },
  },
];
```

## Related Skills

- [self-healing-policies](self-healing-policies) — Define recovery policies
- [agent-introspection-debugging](agent-introspection-debugging) — Debug agent issues
- [eval-harness](eval-harness) — Evaluate agent performance
- [continuous-agent-loop](continuous-agent-loop) — Maintain persistent agent sessions