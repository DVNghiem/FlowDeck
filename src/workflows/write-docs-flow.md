---
name: write-docs-flow
description: "Documentation workflow: explore public APIs → draft docs → review for accuracy → finalize"
triggers:
  - /write-docs
steps:
  - name: explore_apis
    agent: "@code-explorer"
    action: Mapper explores public APIs, exports, and interfaces in the codebase
  - name: draft
    agent: "@writer"
    action: Writer drafts documentation covering API reference, examples, and usage
  - name: review
    agent: "@reviewer"
    action: Reviewer checks accuracy against actual code behavior
  - name: revise
    agent: "@writer"
    action: Writer incorporates review feedback
  - name: finalize
    agent: "@doc-updater"
    action: Write final docs to appropriate location
---

# Write Docs Flow

## Purpose

Generate accurate, up-to-date documentation from the codebase.

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
