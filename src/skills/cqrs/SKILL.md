---
name: cqrs
description: Command Query Responsibility Segregation patterns for separating write and read models.
origin: FlowDeck
---

# CQRS (Command Query Responsibility Segregation)

## When to Activate

Activate when:
- Designing read-heavy or write-heavy systems separately
- Implementing complex domain models with divergent read/write logic
- Building systems that need different data representations for reading vs. writing
- Scaling read and write workloads independently
- Implementing event sourcing alongside specialized read models

## Steps

### 1. Separate Command and Query Models

| Aspect | Command | Query |
|--------|---------|-------|
| Purpose | Modify state | Read state |
| Returns | Void / ACK | Data |
| Side Effects | Yes | No |
| Complexity | Business logic | Data shaping |

Commands and queries should use **different models** with different schemas optimized for their specific use case.

### 2. Design Command Side

- Commands are **intent-based** (present tense: `PlaceOrder`, `UpdatePrice`)
- Validate business rules **before** executing
- Return success/failure, not data
- Keep command handlers small and focused

```typescript
interface Command {
  id: string;          // Correlation ID
  type: string;        // Command type
  payload: unknown;    // Command data
  metadata: {
    userId: string;
    timestamp: string;
    correlationId: string;
  };
}

interface CommandHandler<T extends Command> {
  execute(command: T): Promise<CommandResult>;
}
```

### 3. Design Query Side

- Queries are **data-focused** (past/read tense: `GetUserOrders`, `FindActiveProducts`)
- Queries should be **side-effect free**
- Return **read-optimized** data structures (possibly denormalized)
- Support pagination, filtering, sorting

```typescript
interface Query {
  id: string;
  type: string;
  parameters: Record<string, unknown>;
  pagination?: { page: number; limit: number };
  sorting?: { field: string; direction: 'asc' | 'desc' }[];
}

interface QueryHandler<T extends Query> {
  execute(query: T): Promise<QueryResult>;
}
```

### 4. Implement Synchronization

When commands and queries share data:

1. **Synchronous** (same DB): Update the read model transactionally
2. **Asynchronous** (event-driven): Project events to read models
3. **Dual writes**: Update both models, handle eventual consistency

```typescript
// Synchronous synchronization
async function placeOrder(command: PlaceOrderCommand): Promise<void> {
  const order = Order.create(command.payload);

  await this.transactionManager.execute(async (tx) => {
    // Write to command model
    await this.orderRepo.save(order, tx);

    // Synchronize to read model
    const readModel = {
      orderId: order.id,
      customerId: order.customerId,
      status: order.status,
      total: order.total,
      placedAt: order.placedAt
    };
    await this.orderReadRepo.save(readModel, tx);
  });
}
```

### 5. Handle Eventual Consistency

If read and write models are updated asynchronously:

- Document **expected consistency lag**
- Design UIs to handle stale data gracefully
- Implement **cache invalidation** strategies
- Use **version numbers** or timestamps for cache validation

## Examples

### Command Implementation

```typescript
// commands/place-order.command.ts
interface PlaceOrderCommand {
  orderId?: string;        // Optional, generated if not provided
  customerId: string;
  items: OrderItem[];
  paymentMethod: 'CARD' | 'PAYPAL';
}

class PlaceOrderCommandHandler implements CommandHandler<PlaceOrderCommand> {
  async execute(command: PlaceOrderCommand): Promise<CommandResult> {
    // 1. Validate command
    const validation = this.validate(command);
    if (!validation.success) {
      return CommandResult.failure(validation.errors);
    }

    // 2. Check business invariants
    const customer = await this.customerRepo.findById(command.customerId);
    if (!customer.isActive) {
      return CommandResult.failure('Customer account is not active');
    }

    // 3. Create aggregate
    const order = Order.create({
      id: command.orderId,
      customerId: command.customerId,
      items: command.items
    });

    // 4. Persist
    await this.orderRepo.save(order);

    // 5. Emit event for async processing
    await this.eventBus.publish(OrderPlacedEvent.fromOrder(order));

    return CommandResult.success({ orderId: order.id });
  }
}
```

### Query Implementation

```typescript
// queries/get-order-details.query.ts
interface GetOrderDetailsQuery {
  orderId: string;
  includeItems?: boolean;
}

interface OrderDetailsReadModel {
  orderId: string;
  customerId: string;
  customerName: string;
  status: string;
  total: number;
  placedAt: string;
  items?: OrderItemReadModel[];
}

class GetOrderDetailsQueryHandler implements QueryHandler<GetOrderDetailsQuery, OrderDetailsReadModel> {
  async execute(query: GetOrderDetailsQuery): Promise<OrderDetailsReadModel> {
    const order = await this.readModelRepo.findOrderWithDetails(query.orderId);

    if (!order) {
      throw new QueryNotFoundError('Order not found');
    }

    const result: OrderDetailsReadModel = {
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      status: order.status,
      total: order.total,
      placedAt: order.placedAt
    };

    if (query.includeItems) {
      result.items = await this.readModelRepo.findOrderItems(query.orderId);
    }

    return result;
  }
}
```

### Mediator Pattern for CQRS

```typescript
class CqrsMediator {
  private commandHandlers: Map<string, CommandHandler<any>>;
  private queryHandlers: Map<string, QueryHandler<any>>;

  async send<T>(message: Command | Query): Promise<CommandResult | QueryResult> {
    const handler = message instanceof Command
      ? this.commandHandlers.get(message.type)
      : this.queryHandlers.get(message.type);

    if (!handler) {
      throw new HandlerNotFoundError(message.type);
    }

    return handler.execute(message);
  }
}

// Usage
const result = await mediator.send(new PlaceOrderCommand({ ... }));
const orderDetails = await mediator.send(new GetOrderDetailsQuery({ orderId: '123' }));
```

## Related Skills

- api-design
- event-driven-architecture
- backend-patterns
- event-sourcing
- hexagonal-architecture
