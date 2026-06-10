---
name: research-first
description: Strict research hierarchy before writing code — search codebase, docs, web, and registries in order.
---

# /research-first — Research Hierarchy

Enforces a strict research-first workflow before any implementation. Research in order of proximity: codebase first, structured docs second, web third, registries last.

## Trigger

Use this skill when:
- About to write any new function, module, or integration
- Unsure of an API signature, behavior, or pattern
- Creating utilities, helpers, or abstractions
- Evaluating whether to add a dependency
- Debugging an issue in unfamiliar code

## The Four-Level Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     RESEARCH HIERARCHY                      │
├─────────────────────────────────────────────────────────────┤
│  LEVEL 1: CODEBASE                                          │
│  ┌─────────────┐  ┌─────────────────┐                       │
│  │  CodeGraph  │  │  grep.app       │                       │
│  │  (indexed)  │  │  (code search)  │                       │
│  └─────────────┘  └─────────────────┘                       │
│  When: Need patterns, examples, or existing implementations │
│  Escalate: If codebase has no relevant code                 │
├─────────────────────────────────────────────────────────────┤
│  LEVEL 2: STRUCTURED DOCS                                   │
│  ┌─────────────────┐                                        │
│  │  Context7 MCP   │                                        │
│  │  (library docs) │                                        │
│  └─────────────────┘                                        │
│  When: Need accurate API signatures and usage               │
│  Escalate: If library not indexed or docs incomplete        │
├─────────────────────────────────────────────────────────────┤
│  LEVEL 3: WEB SEARCH                                        │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │  Exa MCP    │  │  Web fetch  │                           │
│  │  (semantic) │  │  (direct)   │                           │
│  └─────────────┘  └─────────────┘                           │
│  When: Level 1-2 insufficient or library unfamiliar         │
│  Escalate: If no authoritative source found                 │
├─────────────────────────────────────────────────────────────┤
│  LEVEL 4: PACKAGE REGISTRIES                                │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │  npm / PyPI │  │  GitHub     │                           │
│  │  (search)   │  │  (packages) │                           │
│  └─────────────┘  └─────────────┘                           │
│  When: Need to verify existence of utility / alternative    │
│  Escalate: Only if nothing suitable exists                  │
└─────────────────────────────────────────────────────────────┘
```

## Level 1: Codebase Search

**When to use:** Always start here. Before writing anything, check if the pattern already exists in the project.

**Tools:**
- `codegraph_search` — find symbols, functions, types by name
- `codegraph_context` — understand how a module or feature works
- `codegraph_explore` — inspect related symbols across files
- `grep_app_searchGitHub` — search GitHub for real-world code examples

**What to look for:**
- Existing utility functions that do what you need
- Similar features implemented elsewhere in the project
- Naming conventions and patterns used by the team
- Test files that show expected usage

**Escalate to Level 2 when:**
- The codebase has no relevant implementation
- You need library-specific API details
- The project uses an external dependency you are unfamiliar with

### Level 1 Example

```
Need: Parse a JSON configuration file with defaults

Step 1: codegraph_search for "parseConfig" or "loadConfig"
Result: Found loadConfig() in src/config/loader.ts

Step 2: codegraph_context for "config loader"
Result: Understands the loader handles JSON, YAML, and env overrides

Decision: Reuse loadConfig() instead of writing a new parser.
```

## Level 2: Structured Documentation (Context7)

**When to use:** You need accurate API signatures, method names, parameter types, or version-specific behavior for a library.

**Tools:**
- `context7_resolve-library-id` — find the correct Context7 ID
- `context7_query-docs` — query structured documentation with examples

**What to look for:**
- Exact function signatures and return types
- Code examples from official docs
- Version-specific behavior and deprecations
- Configuration options and defaults

**Escalate to Level 3 when:**
- The library is not indexed in Context7
- The docs are incomplete or ambiguous
- You need community patterns, not just API reference

### Level 2 Example

```
Need: Use React useEffect cleanup correctly

Step 1: context7_resolve-library-id for "React"
Result: /facebook/react

Step 2: context7_query-docs for "useEffect cleanup function examples"
Result: Official patterns for subscription cleanup, event listener removal

Decision: Use the documented cleanup pattern; no need to search further.
```

## Level 3: Web Search

**When to use:** Levels 1-2 failed to answer the question, or you need community consensus, real-world patterns, or comparisons.

**Tools:**
- `exa_search` — neural search for high-quality sources
- `webfetch` — fetch specific pages for details
- `websearch_web_search_exa` — general web search

**What to look for:**
- Authoritative blog posts or documentation pages
- GitHub issues or discussions explaining edge cases
- Comparison articles when choosing between alternatives
- Community best practices

**Escalate to Level 4 when:**
- No authoritative source answers the question
- You are considering writing a utility and need to check if a package exists
- You need to verify package names, versions, or alternatives

### Level 3 Example

```
Need: Understand how to handle rate limiting in a specific API

Step 1: Level 1 — codebase has no API client for this service
Step 2: Level 2 — Context7 has no docs for this third-party API
Step 3: exa_search for "[ServiceName] API rate limit headers retry-after"
Result: Found official docs and community client implementations

Decision: Implement retry with exponential backoff based on Retry-After header.
```

## Level 4: Package Registries

**When to use:** Before writing any utility function, verify it does not already exist as a well-maintained package.

**Tools:**
- `grep_app_searchGitHub` — search for existing npm/PyPI packages with real usage
- `webfetch` — check npmjs.com or pypi.org directly

**What to look for:**
- Packages that solve the exact problem
- Download counts, maintenance status, and license compatibility
- Bundle size and dependency tree (avoid bloat)

**When to stop:**
- A suitable package exists → adopt or extend it
- No suitable package exists → build custom, informed by research

### Level 4 Example

```
Need: Deep merge two objects with type safety

Step 1-3: No existing implementation or docs answer the need
Step 4: Search npm for "deep merge typescript"
Result: lodash.merge (too heavy), deepmerge-ts (lightweight, typed)

Decision: Install deepmerge-ts. Do not write a custom deep merge.
```

## Decision Tree

```
START: Need to implement or understand something
        │
        ▼
┌───────────────────┐
│ Search codebase   │ ──NO──▶ ┌─────────────────────┐
│ (CodeGraph, grep) │         │ Search structured docs│
└───────────────────┘         │ (Context7 MCP)        │
        │YES                  └─────────────────────┘
        ▼                             │
   [REUSE OR MODEL                    │NO
    AFTER EXISTING]                   ▼
                              ┌─────────────────────┐
                              │ Search web          │
                              │ (Exa, webfetch)     │
                              └─────────────────────┘
                                    │
                                    │NO
                                    ▼
                              ┌─────────────────────┐
                              │ Check registries    │
                              │ (npm, PyPI, GitHub) │
                              └─────────────────────┘
                                    │
                                    │NO
                                    ▼
                              [BUILD CUSTOM]
```

## Anti-Patterns

### Do NOT guess API signatures

```
❌ BAD:
"I think the function is called fetchData(url, options)..."

✅ GOOD:
Use Context7 to query the exact signature, or use codegraph_search
to find existing calls in the codebase.
```

### Do NOT write utility functions that already exist

```
❌ BAD:
Write a custom deepClone() without checking if the project already
uses a utility library or has an internal implementation.

✅ GOOD:
1. codegraph_search for "clone", "deepClone", "copy"
2. Check package.json for lodash, ramda, or similar
3. Only write custom if nothing suitable exists
```

### Do NOT search the web before searching the codebase

```
❌ BAD:
Open a browser search for "how to parse JSON in TypeScript" when
 the project already has a config loader module.

✅ GOOD:
Start with codegraph_context for "config" or "parse" to find
internal patterns before looking externally.
```

### Do NOT load full documentation pages into context

```
❌ BAD:
Fetch an entire docs website or README and dump it into the
conversation context.

✅ GOOD:
Use Context7 for targeted queries. If using webfetch, request
only the specific section or example needed.
```

## Concrete Examples

### Example 1: Implementing a Retry Wrapper

```
❌ BAD APPROACH:
- Assume the signature: async function retry(fn, retries)
- Write a 40-line custom retry with exponential backoff
- Discover later the project uses p-retry everywhere

✅ GOOD APPROACH:
1. codegraph_search for "retry" → finds p-retry usage in src/utils/
2. codegraph_context for "retry pattern" → understands backoff config
3. Reuse p-retry with project-standard options
4. Implementation: 3 lines
```

### Example 2: Parsing a Date Format

```
❌ BAD APPROACH:
- Write a regex: /^(\d{4})-(\d{2})-(\d{2})$/
- Handle edge cases manually (leap years, timezones)
- Result: 30 lines, untested, buggy

✅ GOOD APPROACH:
1. codegraph_search for "date-fns", "moment", "luxon" in imports
2. Context7 query for date-fns parseISO documentation
3. Use date-fns.parseISO() — battle-tested, 1 line
```

### Example 3: Validating an Email Address

```
❌ BAD APPROACH:
- Write a regex from memory
- Guess at what constitutes a valid email
- Result: fragile, probably wrong

✅ GOOD APPROACH:
1. codegraph_search for "email" and "validate" or "zod"
2. Find existing zod schema: z.string().email()
3. Reuse the existing validation pattern
```

## Tool Reference

| Tool | Level | Purpose |
|------|-------|---------|
| `codegraph_search` | 1 | Find symbols by name |
| `codegraph_context` | 1 | Understand modules and features |
| `codegraph_explore` | 1 | Inspect related symbols |
| `grep_app_searchGitHub` | 1, 4 | Code search across GitHub |
| `context7_resolve-library-id` | 2 | Find library in Context7 |
| `context7_query-docs` | 2 | Query structured documentation |
| `exa_search` | 3 | Neural web search |
| `webfetch` | 3 | Fetch specific pages |
| `websearch_web_search_exa` | 3 | General web search |

## Cross-References

- **`search-first`** — Use when evaluating whether to adopt, extend, or build. `research-first` is about the search *process*; `search-first` is about the *decision* after research.
- **`documentation-writer`** — After researching, use this to document findings and patterns for the team.
- **`api-design`** — When research reveals the need for new interfaces, use this skill to design them consistently.

## Integration Points

### With `@backend-coder`
Before implementing any feature, the backend coder should run through Levels 1-2. Only escalate to 3-4 if the codebase and Context7 are insufficient.

### With `@researcher`
The researcher agent specializes in external discovery (Levels 2-4). The coder should handle Level 1 directly before delegating deeper research.

### With `@planner`
The planner should assume research is complete. If a plan includes "write utility X", the planner must verify via codegraph that X does not already exist.
