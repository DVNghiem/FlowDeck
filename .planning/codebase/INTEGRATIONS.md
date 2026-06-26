# External Integrations

**Analysis Date:** 2026-06-26

## APIs & External Services

**OpenCode Platform:**
- OpenCode Plugin API — Plugin lifecycle, tool registration, event hooks
  - SDK: `@opencode-ai/plugin` ^1.17.3
  - Auth: Peer dependency on `@opencode-ai/sdk`

**AI/LLM Services (via OpenCode):**
- Model-agnostic — No hardcoded LLM provider
- Supports 40+ models with USD cost estimation
- Configurable per-agent model overrides in `flowdeck.json`

**Code Search:**
- Grep.app — Code search MCP (built-in)
- Exa — Web search MCP (built-in)

**Documentation:**
- Context7 — Library documentation MCP (built-in)

## Data Storage

**Databases:**
- None — File-based state only

**File Storage:**
- Local filesystem — All state persisted to `.planning/`, `.codebase/` directories
- `.planning/STATE.md` — Session state
- `.planning/PLAN.md` — Execution plans
- `.codebase/` — Codebase intelligence files

**Caching:**
- In-memory AST cache (`dashmap`) — Session-scoped parsed ASTs in `fdx`
- No persistent cache

## Authentication & Identity

**Auth Provider:**
- OpenCode SDK handles authentication
- No custom auth implementation in FlowDeck

## Monitoring & Observability

**Error Tracking:**
- Internal audit log service (`src/services/audit-log.ts`)
- Agent trace graph (`src/services/agent-trace-graph.ts`)
- Workflow scorecards stored in `.codebase/SCORECARDS.jsonl`

**Logs:**
- Plugin app log integration (`client.app.log`)
- Structured logging via OpenCode SDK
- Session event logging (`src/hooks/session-events.ts`)

## CI/CD & Deployment

**Hosting:**
- npm registry — Package distribution
- GitHub — Source repository

**CI Pipeline:**
- GitHub Actions (`.github/` directory present)
- No detailed CI config examined

## Environment Configuration

**Required env vars:**
- `FLOWDECK_GUARD_RAILS_ENABLED` — Enable planning-phase guard rails
- `FLOWDECK_TOOL_GUARD_ENABLED` — Enable tool execution guard
- Standard OpenCode environment variables

**Secrets location:**
- `.env` files (gitignored)
- OpenCode credential store

## Webhooks & Callbacks

**Incoming:**
- None — Plugin operates within OpenCode runtime

**Outgoing:**
- None — No external webhook calls

---

*Integration audit: 2026-06-26*
