---
description: Explore public APIs — writer drafts documentation — reviewer accuracy check — writer finalizes
argument-hint: [--scope=path | --format=api,guide,readme]
---

# Write Docs

Generate accurate, up-to-date documentation from the codebase.

**Input:** $ARGUMENTS — optional `--scope=<path>` and `--format=<type>`

Supported formats: `api` (API reference), `guide` (usage guide), `readme` (README)  
Default: all formats

## Process

### Step 1: CodeGraph Intelligence Check

Before any file exploration, check if codegraph provides a pre-built symbol index:

```
codegraph action=check
```

- **If codegraph indexed (fresh)**: Use `codegraph_search`, `codegraph_explore`, `codegraph_node` to enumerate exported symbols and API entry points. This is faster and more complete than grep.
  - Log: "codegraph available — using symbol index for API discovery"
- **If codegraph absent or stale**: Fall through to @mapper-based exploration

### Step 2: Explore APIs

**If codegraph is available:**

Use codegraph MCP tools to find all exported symbols:
```
codegraph_search("export ")           # exported symbols
codegraph_explore("<scope or src/>")  # survey module structure
codegraph_context("<key entry points>") # full context per area
```

**If codegraph is not available:**

Spawn `@mapper` to:
- Find all exported functions, classes, and types
- Identify public API entry points
- Map key workflows and integration points

```bash
# Find exports
grep -rn "export " src/ --include="*.ts"
# Find public interfaces
grep -rn "export interface\|export type\|export class" src/ --include="*.ts"
```

### Step 3: Draft Documentation

Spawn `@writer` to produce:

**API Reference**
```markdown
## functionName(param: Type): ReturnType

Description of what the function does.

**Parameters:**
- `param` (Type) — description

**Returns:** description

**Example:**
\`\`\`typescript
const result = functionName(value);
\`\`\`
```

**Usage Guide**
- Step-by-step workflow with examples
- Common patterns and best practices
- Configuration options

**Troubleshooting**
- Common errors and their solutions

### Step 4: Review for Accuracy

Spawn `@reviewer` to verify:
- Every documented function/method actually exists
- Parameter types match the actual signatures
- Examples are syntactically correct
- No outdated API references

If codegraph is available: use `codegraph_node` to verify specific function signatures against documentation.

### Step 5: Finalize

Writer incorporates feedback and writes final docs to:
- `README.md` — project overview and quick start
- `docs/API.md` — complete API reference
- `docs/USER_GUIDE.md` — detailed usage guide

## Output

Updated documentation files with:
- Accurate function signatures
- Working code examples
- Clear explanations of behavior

Report: files written/updated, public APIs documented, any gaps found, codegraph used ✅/❌.
