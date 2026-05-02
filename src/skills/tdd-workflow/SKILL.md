---
name: tdd-workflow
description: Enforces Test-Driven Development with Red-Green-Refactor cycle and 80%+ coverage. Activate when writing new features, fixing bugs, or refactoring.
origin: FlowDeck
---

# TDD Workflow Skill

Tests before code. Always. Red-Green-Refactor is not a suggestion.

## When to Activate

Activate when:
- Implementing any new feature
- Fixing any bug
- Refactoring existing code

## Core Principles

- **Tests before code** — write the failing test first, then the implementation
- **Minimum implementation** — write the least code that makes the test pass
- **Refactor after green** — clean up only when tests are passing
- **80%+ coverage** — non-negotiable threshold

## Workflow

### Red — Write a Failing Test

Write a test that describes the behavior you want. It must fail before you write any implementation.

```typescript
// AAA Pattern: Arrange, Act, Assert
describe('calculateDiscount', () => {
  it('should apply 10% discount for premium users', () => {
    // Arrange
    const user = { tier: 'premium' };
    const price = 100;

    // Act
    const result = calculateDiscount(price, user);

    // Assert
    expect(result).toBe(90);
  });

  it('should return full price for standard users', () => {
    // Arrange
    const user = { tier: 'standard' };
    const price = 100;

    // Act
    const result = calculateDiscount(price, user);

    // Assert
    expect(result).toBe(100);
  });
});
```

Run it: `npm test` → must fail with "cannot find function" or similar.

### Green — Minimum Code to Pass

Write the minimum implementation:

```typescript
function calculateDiscount(price: number, user: { tier: string }): number {
  if (user.tier === 'premium') return price * 0.9;
  return price;
}
```

Run it: `npm test` → must pass.

### Refactor — Clean Up While Green

Now clean up the implementation:

```typescript
const DISCOUNT_RATES: Record<string, number> = {
  premium: 0.10,
};

function calculateDiscount(price: number, user: { tier: string }): number {
  const discountRate = DISCOUNT_RATES[user.tier] ?? 0;
  return price * (1 - discountRate);
}
```

Run it: `npm test` → must still pass.

### Git Checkpoint

After each Red-Green-Refactor cycle:

```bash
git add -A
git commit -m "test: add calculateDiscount + implementation"
```

## Test Types

| Type | When | Tools |
|------|------|-------|
| Unit | Functions, services with mocked deps | vitest, jest |
| Integration | API endpoints, database queries | supertest, vitest |
| E2E | Critical user flows | playwright, cypress |

Write unit tests for every function. Integration tests for every API route. E2E only for critical paths.

## Coverage Check

```bash
npx vitest --coverage          # vitest
npx jest --coverage            # jest
```

Threshold: 80% line coverage minimum. If below, write more tests before considering the work done.

## Common Mistakes

- Writing tests AFTER implementation — these are not TDD tests
- Writing tests that always pass (asserting something trivially true)
- Skipping the Refactor step — leaving messy green code is not TDD
- Testing implementation details instead of behavior
- Giant tests that test multiple behaviors at once
