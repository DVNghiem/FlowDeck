# Coding Style

Language-agnostic coding conventions followed by all FlowDeck agents.

## Core Principles

| # | Rule | Description |
|---|------|-------------|
| 1 | **No Redundant Code** | No redundant arguments, methods, or attributes. Each piece of code must serve a purpose. |
| 2 | **Simplicity** | Code should be simple and easy to understand. Prefer clarity over cleverness. |
| 3 | **Clear Commands** | Code should have clear, explicit commands. No ambiguity in intent. |
| 4 | **Extensibility** | Code must be easily extendable. Design for growth, not just current needs. |
| 5 | **Documentation** | Code must have clear documentation at the beginning of every file. |
| 6 | **Information Security** | Comply with information security best practices. No secrets, no injections, no XSS. |
| 7 | **Memory Optimization** | Optimize memory usage to the minimum possible. Avoid unnecessary allocations. |
| 8 | **Speed** | Process speed should be as fast as possible. Prefer efficient algorithms and data structures. |
| 9 | **Single Responsibility** | Each function/class does one thing well. Easier to test, debug, and extend. |
| 10 | **Testability** | Code should be easy to test in isolation. Avoid hidden dependencies and global state. |
| 11 | **Consistency** | Follow existing patterns in the codebase. Consistency over personal preference. |
| 12 | **Resource Cleanup** | Always release resources (connections, file handles, timers). Use try-finally or defer. |

## Immutability

Always create new objects and arrays. Never mutate parameters.

```typescript
// ❌ NEVER — mutating a parameter
function addRole(user: User, role: string): void {
  user.roles.push(role);
}

// ✅ ALWAYS — return new object
function addRole(user: User, role: string): User {
  return { ...user, roles: [...user.roles, role] };
}
```

## KISS / DRY / YAGNI

| Principle | Rule |
|-----------|------|
| **KISS** (Keep It Simple) | The simplest solution that works is the right solution |
| **DRY** (Don't Repeat Yourself) | Extract duplication only when you have 3+ identical instances |
| **YAGNI** (You Aren't Gonna Need It) | Don't add features for hypothetical future needs |

```typescript
// ❌ YAGNI — configurable for no reason
function createUser(email: string, options: {
  hashAlgorithm?: 'bcrypt' | 'argon2';  // only ever bcrypt in practice
  saltRounds?: number;
  legacyCompatMode?: boolean;
}) { ... }

// ✅ Simple
function createUser(email: string, password: string): Promise<User> { ... }
```

## File Organization

- Many small, focused files > few large files
- **Typical file size**: 200-400 lines
- **Maximum**: 800 lines — if larger, split it
- **One responsibility per file**: `user-service.ts`, not `all-services.ts`

## Error Handling

Handle errors explicitly at every level. Never swallow errors silently.

```typescript
// ❌ Silent catch — hides failures
try {
  await saveUser(user);
} catch (e) {}

// ❌ Logging without rethrowing — caller doesn't know it failed
try {
  await saveUser(user);
} catch (e) {
  console.error(e);
}

// ✅ Explicit — log context, rethrow or convert to domain error
try {
  await saveUser(user);
} catch (error) {
  logger.error('Failed to save user', { userId: user.id, error });
  throw new ServiceError('USER_SAVE_FAILED', { cause: error });
}
```

Errors propagate upward unless you have a specific reason to handle them at this level.

## Input Validation

Validate all external inputs at the system boundary:

```typescript
// System boundaries where validation is required:
// - API endpoints (HTTP request body, query params, headers)
// - File uploads (type, size, content)
// - Environment variables (on startup)
// - User input from forms

// ✅ Validate at the boundary — not deep in business logic
router.post('/users', async (req, res) => {
  const result = createUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({ error: result.error.flatten() });
  }
  const user = await userService.create(result.data);
  res.status(201).json(user);
});
```

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Variables | camelCase | `userEmail`, `isActive` |
| Functions | camelCase | `createUser()`, `fetchProfile()` |
| Types / Interfaces | PascalCase | `User`, `CreateUserInput` |
| Classes | PascalCase | `UserService`, `PaymentGateway` |
| React Components | PascalCase | `UserCard`, `LoginForm` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT` |
| Files | kebab-case | `user-service.ts`, `auth-middleware.ts` |
| Directories | kebab-case | `user-management/`, `api-routes/` |

## Code Smells to Avoid

| Smell | Threshold | Fix |
|-------|-----------|-----|
| Deep nesting | > 3 levels | Extract guard clauses or helper functions |
| Magic numbers | Any unlabeled number | Name the constant: `MAX_ITEMS = 100` |
| Long functions | > 50 lines | Extract smaller functions |
| Boolean parameters | Any `doThing(true)` | Use options object: `doThing({ verbose: true })` |
| Long argument lists | > 3 parameters | Use an options object |
| Implicit any | Any untyped value | Add explicit type annotation |
