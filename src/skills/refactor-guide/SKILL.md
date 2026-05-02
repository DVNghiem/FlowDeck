---
name: refactor-guide
description: Safe refactoring workflow. Ensure tests pass before and after, change structure without changing behavior, no public API breakage. Use for code maintenance and cleanup.
origin: FlowDeck
---

# Refactor Guide Skill

Changes structure without changing behavior. One transformation at a time. Tests must stay green throughout.

## When to Activate

Activate when:
- A function is over 50 lines
- A file is over 800 lines
- There is significant code duplication
- Variable or function names are misleading
- You are preparing code for a new feature

## Core Principles

- Tests green before you start — if not, fix tests first
- One transformation per commit
- No features in refactor commits
- If any test breaks, undo and try a smaller step

## Safe Refactoring Process

```
1. npm test → must be GREEN before starting

2. Apply ONE transformation
   (extract function, rename, move module — one thing only)

3. npm test → must still be GREEN

4. git commit -m "refactor: [description]"

5. Repeat from step 2
```

## Extract Function Pattern

```typescript
// ❌ Before — inline, hard to test independently
function createOrder(items: Item[], userId: string) {
  if (!items || items.length === 0) {
    throw new Error('Order must have items');
  }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  if (total > 10000) {
    throw new Error('Order total exceeds limit');
  }
  // ... save to DB
}

// ✅ After — each function has a single responsibility
function validateOrderItems(items: Item[]): void {
  if (!items || items.length === 0) {
    throw new Error('Order must have items');
  }
}

function calculateOrderTotal(items: Item[]): number {
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}

function assertTotalWithinLimit(total: number): void {
  if (total > 10000) throw new Error('Order total exceeds limit');
}

function createOrder(items: Item[], userId: string) {
  validateOrderItems(items);
  const total = calculateOrderTotal(items);
  assertTotalWithinLimit(total);
  // ... save to DB
}
```

## Extract Variable Pattern

```typescript
// ❌ Before — magic numbers and complex expression
if (user.createdAt < Date.now() - 30 * 24 * 60 * 60 * 1000) { ... }

// ✅ After — named intent
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const accountAge = Date.now() - user.createdAt;
const isNewUser = accountAge < THIRTY_DAYS_MS;
if (isNewUser) { ... }
```

## Danger Signs — Stop Immediately

- Tests breaking during refactor → undo, try smaller step
- Adding a feature while refactoring → separate commit
- Renaming AND moving in same commit → split into two commits
- Touching unrelated code → leave it alone

## Output Format

```markdown
## Refactor Summary

### Transformations (in order applied)
1. Extracted `validateOrderItems()` — order.ts:23-28
2. Extracted `calculateOrderTotal()` — order.ts:29-31
3. Renamed `getData()` → `fetchUserProfile()` — 4 files

### Before/After
- order.ts: 180 lines → 120 lines
- 2 new unit tests for extracted functions

### Test Results
- Before: 45 tests passing
- After: 47 tests passing
```
