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

### Step 1: Explore APIs

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

### Step 2: Draft Documentation

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

### Step 3: Review for Accuracy

Spawn `@reviewer` to verify:
- Every documented function/method actually exists
- Parameter types match the actual signatures
- Examples are syntactically correct
- No outdated API references

### Step 4: Finalize

Writer incorporates feedback and writes final docs to:
- `README.md` — project overview and quick start
- `docs/API.md` — complete API reference
- `docs/USER_GUIDE.md` — detailed usage guide

## Output

Updated documentation files with:
- Accurate function signatures
- Working code examples
- Clear explanations of behavior

Report: files written/updated, public APIs documented, any gaps found.
