---
name: ddd-architecture
description: Domain-Driven Design patterns for bounded contexts, aggregates, and ubiquitous language.
origin: FlowDeck
---

# ddd-architecture

## When to Activate
When modeling complex business domains where deep understanding of the problem space, ubiquitous language, and bounded contexts are critical for long-term maintainability.

## Steps
1. **Establish the bounded context** - Identify the explicit boundary within which a single model (ubiquitous language) holds.
2. **Build the domain model** - Create entities, value objects, aggregates, and domain events that reflect real business concepts.
3. **Define aggregates** - Group related entities and value objects under a root aggregate that enforces invariants.
4. **Identify domain events** - Capture meaningful business occurrences that other parts of the system may need to react to.
5. **Create domain services** - Model operations that don't naturally belong to a single entity or value object.
6. **Define repository interfaces** - Create ports for persisting and retrieving aggregates (implementation is infrastructure).
7. **Implement application services** - Orchestrate the domain model, handle transactions, and coordinate multiple aggregates.
8. **Establish anti-corruption layers** - Translate between external systems (legacy, third-party) and your domain model.

## Examples
```typescript
// Value Object - Immutable concept with equality
class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: Currency
  ) {}

  static of(amount: number, currency: Currency): Money {
    return new Money(Math.round(amount * 100) / 100, currency)
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch')
    }
    return Money.of(this.amount + other.amount, this.currency)
  }
}

// Aggregate Root - Enforces invariants for the aggregate
class Order extends AggregateRoot {
  constructor(
    private readonly id: OrderId,
    private readonly customer: Customer,
    private items: OrderItem[],
    private status: OrderStatus
  ) {
    super()
    this.validate()
  }

  private validate(): void {
    if (this.items.length === 0) {
      throw new DomainException('Order must have at least one item')
    }
  }

  get total(): Money {
    return this.items.reduce(
      (sum, item) => sum.add(item.subtotal),
      Money.of(0, Currency.USD)
    )
  }

  // Business methods that enforce invariants
  addItem(item: OrderItem): void {
    if (this.status !== OrderStatus.DRAFT) {
      throw new DomainException('Cannot add items to a non-draft order')
    }
    this.items.push(item)
    this.addDomainEvent(new OrderItemAddedEvent(this.id, item))
  }

  submit(): void {
    if (!this.canSubmit()) {
      throw new DomainException('Order cannot be submitted')
    }
    this.status = OrderStatus.SUBMITTED
    this.addDomainEvent(new OrderSubmittedEvent(this))
  }

  private canSubmit(): boolean {
    return this.status === OrderStatus.DRAFT && this.items.length > 0
  }
}

// Domain Event - Business facts that may trigger reactions
class OrderSubmittedEvent extends DomainEvent {
  constructor(public readonly order: Order) {
    super('order.submitted', order.id)
  }
}

// Repository Interface (Port) - Persistence abstraction
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>
  findByCustomer(customerId: CustomerId): Promise<Order[]>
  save(order: Order): Promise<void>
}
```

## Related Skills
- clean-architecture
- hexagonal-architecture
- layered-architecture
- saga-architecture
- backend-patterns
