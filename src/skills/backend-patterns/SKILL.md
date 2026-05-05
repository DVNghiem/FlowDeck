# backend-patterns

## When to Activate
When implementing backend services, APIs, or server-side logic. Use when designing service layers, data access patterns, or middleware.

## Steps
1. **Identify the service layer** - Determine if you need a service layer to orchestrate business logic
2. **Apply Repository Pattern** - Encapsulate data access behind repository interfaces for testability
3. **Use Dependency Injection** - Pass dependencies explicitly rather than creating them inside classes
4. **Implement error handling** - Add comprehensive error handling with appropriate HTTP status codes
5. **Add middleware/logging** - Log requests, responses, and errors consistently

## Examples

```typescript
// Service Layer with Repository Pattern
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findAll(filter?: UserFilter): Promise<User[]>;
  create(attributes: CreateUserDTO): Promise<User>;
  update(id: string, attributes: UpdateUserDTO): Promise<User>;
  delete(id: string): Promise<void>;
}

class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUser(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User with id ${id} not found`);
    }
    return user;
  }

  async createUser(dto: CreateUserDTO): Promise<User> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }
    return this.userRepository.create(dto);
  }
}

// Dependency Injection Container
const container = new Container();
container.register('userRepository', () => new PostgresUserRepository());
container.register('userService', () => new UserService(container.resolve('userRepository')));
```

```typescript
// Error Handling with Custom Exceptions
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details?: Record<string, string[]>
  ) {
    super(message, 'VALIDATION_ERROR', 422);
  }
}

// Global Error Handler Middleware
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err instanceof ValidationError ? err.details : undefined,
      },
    });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

## Related Skills
- api-design
- postgres-patterns
- python-patterns
- layered-architecture
- ddd-architecture
