---
description: TypeScript-specific conventions — strict mode, type safety, async patterns, error handling
always_on: false
stages: [execute, fix-bug, verify]
languages: [typescript]
---

# TypeScript Patterns

TypeScript-specific conventions and patterns for FlowDeck projects.

## Strict Mode

Always on. No exceptions.

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

## API Response Format

Use a consistent response shape for all API responses:

```typescript
interface ApiResponse<T> {
  data: T;
  error: null;
  metadata?: {
    page?: number;
    total?: number;
    cursor?: string;
  };
}

interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

type ApiResult<T> = ApiResponse<T> | ApiError;
```

## Custom Hooks Pattern

```typescript
// ✅ Return an object (not an array) when returning multiple values
function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const user = await authService.login(email, password);
      setUser(user);
    } finally {
      setLoading(false);
    }
  }, []);

  return { user, loading, login };
}

// Naming: useXxx
// Co-locate with the component that primarily uses it
// Return object (not array) for more than one value
```

## Repository Pattern

Interface first. Concrete implementation separate. Inject at the call site.

```typescript
// Define the interface
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, patch: Partial<UpdateUserInput>): Promise<User>;
  delete(id: string): Promise<void>;
}

// Concrete implementation
class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    return this.db.query('SELECT * FROM users WHERE id = $1', [id]).then(r => r.rows[0] ?? null);
  }
  // ...
}

// Inject at service level — never instantiate in the method
class UserService {
  constructor(private readonly users: UserRepository) {}
}
```

## Result Types for Error Handling

Prefer explicit error contracts (Result types or typed exceptions) for business logic. Use one pattern consistently within a module.

```typescript
type Ok<T> = { ok: true; value: T };
type Err<E> = { ok: false; error: E };
type Result<T, E = Error> = Ok<T> | Err<E>;

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// Usage
async function createUser(input: CreateUserInput): Promise<Result<User, ValidationError>> {
  const validation = validateInput(input);
  if (!validation.ok) return err(validation.error);

  const user = await db.create(input);
  return ok(user);
}

// Caller
const result = await createUser(input);
if (!result.ok) {
  logger.error('Validation failed', result.error);
  return res.status(422).json({ error: result.error });
}
res.status(201).json(result.value);
```

## TypeScript Conventions

```typescript
// ✅ Interfaces for object shapes (preferred over type aliases)
interface User {
  id: string;
  email: string;
}

// ✅ Type aliases for unions and complex types
type UserRole = 'admin' | 'user' | 'guest';
type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// ✅ Explicit return types on all public functions
async function fetchUser(id: string): Promise<User | null> { ... }

// ✅ Const assertions for literal types
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'user' | 'guest'

// ✅ Discriminated unions for state machines
type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User }
  | { status: 'error'; error: string };

// ❌ No implicit any
function process(data) { ... }       // ❌
function process(data: unknown) { } // ✅
```
