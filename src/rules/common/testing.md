# Testing Standards

All code must meet these testing standards before being considered done.

## Minimum Coverage

**80% line coverage** — non-negotiable.

```bash
npx vitest --coverage          # vitest
npx jest --coverage            # jest
```

A task is not complete until coverage is ≥ 80%.

## TDD Workflow

Follow Red-Green-Refactor for all new code:

1. **Red** — write a failing test that describes the desired behavior
2. **Green** — write the minimum code to make it pass
3. **Refactor** — clean up while keeping tests green
4. **Commit** — commit the test + implementation together

Never write implementation before writing a failing test.

## Test Types

| Type | Purpose | Tools | When Required |
|------|---------|-------|--------------|
| Unit | Functions in isolation, mocked deps | vitest, jest | Every function with logic |
| Integration | API + database end-to-end | supertest, vitest | Every API route |
| E2E | Full user flow in browser | playwright, cypress | Critical user journeys |

## AAA Pattern

Every test uses Arrange-Act-Assert:

```typescript
describe('UserService.create', () => {
  it('should throw ValidationError when email format is invalid', async () => {
    // Arrange
    const service = new UserService(mockDb);
    const input = { email: 'not-an-email', password: 'valid-pass' };

    // Act
    const result = service.create(input);

    // Assert
    await expect(result).rejects.toThrow('ValidationError');
  });
});
```

## Test Naming

Test names describe behavior in plain language:

```typescript
// ✅ Describes behavior
it('should return empty array when user has no orders')
it('should throw AuthError when token is expired')
it('should send confirmation email after successful registration')

// ❌ Vague
it('test1')
it('works')
it('handles the error case')
```

Format: `should [expected behavior] when [condition]`

## Test Organization

- **Co-locate** tests with source: `user-service.ts` → `user-service.test.ts`
- Or use a parallel `__tests__/` directory — be consistent within the project
- One `describe` block per module or class
- Group related tests with nested `describe` blocks

## What to Test

- Public interfaces and API contracts
- Error conditions and edge cases
- Auth scenarios (unauthenticated, unauthorized, correct role)
- Empty inputs, null, undefined
- Boundary values (max length, zero, negative numbers)

## What NOT to Test

- Private methods (test via public interface)
- Third-party library behavior
- Simple getters with no logic
- Framework internals (Express routing, ORM query builder)

## Troubleshooting Test Failures

| Situation | Action |
|-----------|--------|
| Test fails after code change | Fix the implementation |
| Test fails after refactor | Undo the refactor; take smaller steps |
| Test fails and assertion is wrong | Fix the assertion (rare — verify carefully) |
| Tests are flaky | Find and isolate the shared mutable state |
| Coverage below 80% | Add tests for uncovered branches and edge cases |

**Never change a test to make it pass unless the assertion logic itself is wrong.**
