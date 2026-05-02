---
name: arch-constraint-guard
description: Block edits that violate known system boundaries, team rules, service contracts, or domain-layer separation. Reads rules from .codebase/CONSTRAINTS.md.
origin: FlowDeck
---

# Architectural Constraint Guard

Before writing any file, check if the edit violates architectural boundaries defined in `.codebase/CONSTRAINTS.md`. If it does, stop and explain the violation.

## CONSTRAINTS.md Format

Create `.codebase/CONSTRAINTS.md` to encode your team's architectural rules:

```markdown
## Forbidden Paths
- src/core/         # do not modify core — all changes via PR with 2 approvals
- src/generated/    # auto-generated, do not edit manually
- infra/secrets/    # managed by Terraform only

## Layer Rules
- UI components MUST NOT import from services/ directly — use hooks/ or context/
- services/ MUST NOT import from routes/ — services are framework-agnostic
- domain/ MUST NOT import from infra/ — keep domain pure

## Service Contract Rules
- PaymentService API is frozen — no method signature changes without RFC
- UserSchema is owned by auth-team — no schema changes without approval

## Naming Conventions
- React components: PascalCase only
- Database tables: snake_case only
- API endpoints: kebab-case only
```

## Workflow

For every proposed write or edit:

1. Read `.codebase/CONSTRAINTS.md`
2. Check the target file path against `## Forbidden Paths`
3. Check the import graph against `## Layer Rules`
4. Check method signatures against `## Service Contract Rules`
5. If any violation is found: **STOP**, report the specific rule violated, and suggest a compliant alternative

## When No CONSTRAINTS.md Exists

If `.codebase/CONSTRAINTS.md` does not exist:
1. Infer boundaries from ARCHITECTURE.md (layer names, service boundaries)
2. Apply common-sense defaults: UI does not directly query DB, domain does not call HTTP
3. Suggest creating CONSTRAINTS.md to codify the rules you discover

## Violation Report Format

```
ARCH CONSTRAINT VIOLATION
Rule: [rule name from CONSTRAINTS.md]
File: [target file]
Violation: [what was attempted]
Compliant alternative: [what to do instead]
```
