---
name: clean-architecture
description: Apply Clean Architecture boundaries to keep domain logic isolated from frameworks and infrastructure.
origin: FlowDeck
---

# clean-architecture

## When to Activate
When designing or implementing a new feature or service that needs clear separation of concerns, testability, and independence from frameworks, databases, or UI libraries.

## Steps
1. **Identify the core business logic** - Determine the essential domain rules that would exist even if the application had no UI, database, or external services.
2. **Define the boundary** - Draw a clear boundary between the inner circles (entities, use cases) and outer circles (interfaces, infrastructure).
3. **Place dependencies pointing inward** - Dependencies should always point toward the center. The inner circle knows nothing about the outer circle.
4. **Define ports (interfaces)** - Create interfaces in the domain layer that define how the outside world can interact with it.
5. **Implement adapters** - Create concrete implementations (adapters) for databases, web frameworks, external APIs, etc. in the outer layers.
6. **Wire everything via dependency injection** - Use a composition root or DI container to assemble the application.

## Examples
```typescript
// Domain Layer - Enterprise Business Rules (innermost circle)
class Order {
  constructor(
    private readonly id: string,
    private readonly items: OrderItem[],
    private readonly status: OrderStatus
  ) {}

  get total(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }

  canBeFulfilled(): boolean {
    return this.status === 'pending' && this.items.length > 0
  }
}

// Application Layer - Application Business Rules
interface OrderRepository {
  findById(id: string): Promise<Order | null>
  save(order: Order): Promise<void>
}

interface NotificationService {
  sendOrderConfirmation(order: Order): Promise<void>
}

class PlaceOrderUseCase {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly notifier: NotificationService
  ) {}

  async execute(orderData: OrderData): Promise<Order> {
    const order = new Order(orderData.id, orderData.items, 'pending')

    if (!order.canBeFulfilled()) {
      throw new InvalidOrderError('Order cannot be fulfilled')
    }

    await this.orderRepo.save(order)
    await this.notifier.sendOrderConfirmation(order)

    return order
  }
}

// Infrastructure Layer - Interface Adapters (outermost circle)
class PostgresOrderRepository implements OrderRepository {
  async findById(id: string): Promise<Order | null> {
    // Database implementation
  }

  async save(order: Order): Promise<void> {
    // Database implementation
  }
}

class EmailNotificationService implements NotificationService {
  async sendOrderConfirmation(order: Order): Promise<void> {
    // Email implementation
  }
}
```

## Related Skills
- layered-architecture
- hexagonal-architecture
- ddd-architecture
- backend-patterns
