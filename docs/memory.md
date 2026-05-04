# Memory System

FlowDeck includes a persistent memory system that stores tool executions, assistant messages, and session summaries. This helps agents recall what was worked on in previous sessions.

## How It Works

Memory is automatically captured during sessions:

1. **Session Start** — Session is registered with project directory
2. **Tool Execution** — Every tool call (Read, Write, Edit, Bash, etc.) is stored
3. **Assistant Messages** — Agent responses are captured
4. **Session Compact/Summary** — End-of-session summaries are stored

## Storage

- **Location**: `~/.flowdeck-memory/memory.db`
- **Format**: SQLite database (using `bun:sqlite`)
- **Tables**:
  - `sessions` — Session metadata (project, directory, timestamps)
  - `observations` — Tool executions and messages
  - `summaries` — Session summaries

## Using Memory

### Search Tool

Use the `memory-search` tool to query past observations:

```
tool: memory-search
args: { query: "authentication", limit: 5 }
```

**Arguments:**
- `query` (optional) — Search text for tool names, inputs, and outputs
- `session_id` (optional) — Retrieve all observations from a specific session
- `limit` (optional) — Max results (default: 10)

### Example Queries

```javascript
// Search for specific work
tool: memory-search
args: { query: "Redis cache" }

// Get recent sessions
tool: memory-search
args: { limit: 10 }

// Get all observations from a session
tool: memory-search
args: { session_id: "abc-123" }
```

## Context Injection

When a new session starts in the same directory, FlowDeck can optionally inject relevant context from previous sessions. This helps maintain continuity across sessions.

## Privacy

- Memory is stored per-user at `~/.flowdeck-memory/`
- Each project directory has its own session tracking
- Use session.delete event to remove specific sessions

## Configuration

No configuration required — memory is enabled by default.

To disable memory tracking for a project, you would need to modify the session tracking hooks in the FlowDeck plugin configuration.
