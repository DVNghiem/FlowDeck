# hexagonal-architecture

## When to Activate
When building applications that must remain flexible to changing external systems (databases, APIs, UI frameworks) and need to support multiple entry points (ports) for the same business logic.

## Steps
1. **Identify the core domain** - Isolate the pure business logic that makes no references to infrastructure.
2. **Define inbound ports** - Create interfaces (ports) for primary/ driving actors (UI, API controllers) that trigger application logic.
3. **Define outbound ports** - Create interfaces (ports) for secondary/ driven actors (databases, external services) that the domain calls.
4. **Implement primary adapters** - Create adapters for inbound traffic (REST controllers, GraphQL resolvers, CLI commands).
5. **Implement secondary adapters** - Create adapters for outbound traffic (Postgres repositories, Redis caches, email gateways).
6. **Ensure domain has no external dependencies** - The domain layer should compile and run with no imports from adapters.
7. **Wire via dependency injection** - Connect adapters to ports at application startup.

## Examples
```typescript
// Domain Core - Pure business logic, no infrastructure dependencies
class Transfer {
  constructor(
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amount: number
  ) {}

  execute(accounts: Map<string, Account>): TransferResult {
    const from = accounts.get(this.fromAccountId)
    const to = accounts.get(this.toAccountId)

    if (!from || !to) {
      return TransferResult.failed('Account not found')
    }

    if (!from.canDebit(this.amount)) {
      return TransferResult.failed('Insufficient funds')
    }

    from.debit(this.amount)
    to.credit(this.amount)

    return TransferResult.success()
  }
}

// Inbound Port (Primary Port) - Interface for driving operations
interface TransferUseCase {
  execute(transfer: Transfer): TransferResult
}

// Outbound Port (Secondary Port) - Interface for driven operations
interface AccountRepository {
  findById(id: string): Promise<Account | null>
  save(account: Account): Promise<void>
}

interface EventBus {
  publish(event: DomainEvent): Promise<void>
}

// Primary Adapter - REST API
class TransferController implements TransferUseCase {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(transfer: Transfer): Promise<TransferResult> {
    const allAccounts = await this.accounts.findById(transfer.fromAccountId)
    // ... handle via injected port
  }
}

// Secondary Adapter - PostgreSQL implementation
class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly db: Database) {}
  // ... implementation
}
```

## Related Skills
- clean-architecture
- layered-architecture
- ddd-architecture
- backend-patterns
