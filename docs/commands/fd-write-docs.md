# /fd-write-docs

**Purpose:** Explore APIs and generate accurate, up-to-date documentation from the codebase.

## Usage

/fd-write-docs [--scope=path] [--format=api,guide,readme]

## Arguments

- `--scope=path` (optional) — limit documentation scope to a specific path
- `--format=api|guide|readme` (optional) — output format: `api` (API reference), `guide` (usage guide), `readme` (README). Default: all formats

## What Happens

### Step 1: CodeGraph Intelligence Check

Before any file exploration, check if codegraph provides a pre-built symbol index:
```
codegraph action=check
```

- **If codegraph indexed (fresh)**: Use `codegraph_search`, `codegraph_explore`, `codegraph_node` to enumerate exported symbols and API entry points. Log: "codegraph available — using symbol index for API discovery".
- **If codegraph absent or stale**: Fall through to @mapper-based exploration.

### Step 2: Explore APIs

**If codegraph is available:**
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

Fallback commands:
```bash
grep -rn "export " src/ --include="*.ts"
grep -rn "export interface\|export type\|export class" src/ --include="*.ts"
```

### Step 3: Draft Documentation

Spawn `@writer` to produce:

**API Reference:**
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

**Usage Guide:**
- Step-by-step workflow with examples
- Common patterns and best practices
- Configuration options

**Troubleshooting:**
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

## Output / State

Updated documentation files:
- `README.md` — project overview and quick start
- `docs/API.md` — complete API reference
- `docs/USER_GUIDE.md` — detailed usage guide

Report: files written/updated, public APIs documented, any gaps found, codegraph used status.

## Examples

**Generate all documentation formats:**
```
/fd-write-docs
```

**Generate only API reference for a specific scope:**
```
/fd-write-docs --scope=src/api --format=api
```

**Generate README for the project root:**
```
/fd-write-docs --format=readme
```

## Related Commands

- `/fd-map-codebase` — generate the codebase documentation that informs API exploration
- `/fd-discuss` — explore before writing to understand what matters most
- `/fd-verify` — validate documentation accuracy after generation