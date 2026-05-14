---
name: repo-memory-graph
description: Build and maintain a persistent graph of architecture, conventions, bug history, ownership patterns, and module relationships for this specific codebase.
origin: FlowDeck
---

# Repo Memory Graph

The Repo Memory Graph is FlowDeck's long-term knowledge store about this specific codebase. It persists in `.codebase/MEMORY.json` and grows over time.

## What Gets Stored

- **Modules**: files, their type (service/api/schema/config), owner, tags
- **Dependencies**: which modules import or call which others
- **Conventions**: patterns used in this repo (naming, error handling, auth flow)
- **Bug history**: which modules have had recurring issues
- **Ownership**: who owns what (from git blame, CODEOWNERS, or explicit annotation)

## When to Update

Update the graph:
- After running `/fd-map-codebase`
- When onboarding a new module
- When a bug fix reveals a recurring pattern (add to `bug_history`)
- When a refactor changes module ownership

## Usage with `repo-memory` tool

```json
// Write a node
{ "action": "write_node", "node_id": "auth-service", "node": {
    "type": "service", "path": "src/services/auth.ts",
    "owner": "security-team", "tags": ["auth", "jwt"],
    "dependencies": ["user-model", "token-store"],
    "dependents": ["api-gateway", "session-handler"],
    "bug_history": ["jwt-expiry-bug-2024-03"],
    "conventions": ["always validate token before processing"]
}}

// Query by owner
{ "action": "query", "query": { "owner": "security-team" } }
```

## How Agents Use This

- **Impact Radar**: walks the dependency graph to find affected modules
- **Blast Radius**: traverses dependents to map downstream risk
- **Regression Prediction**: uses bug_history to weight risk categories
- **Architectural Constraint Guard**: checks module boundaries before allowing edits
