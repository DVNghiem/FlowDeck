# Event-Driven Architecture

## When to Activate

Activate when:
- Designing or implementing message-based communication between services
- Building systems that require asynchronous processing
- Decoupling producers from consumers in distributed systems
- Implementing event sourcing or audit trails
- Setting up webhooks, message queues, or pub/sub patterns

## Steps

### 1. Identify Event Boundaries

Define what constitutes an "event" in your system:
- Events are **facts** about something that happened (past tense: `OrderPlaced`, `PaymentProcessed`)
- Commands are **requests** for an action (present tense: `PlaceOrder`, `ProcessPayment`)
- Events should be **immutable** once emitted

### 2. Choose the Right Messaging Pattern

| Pattern | Use Case | Examples |
|---------|----------|----------|
| Pub/Sub | One-to-many notification | Notifications, audit logs |
| Message Queue | Point-to-point processing | Order processing, email sending |
| Event Streaming | Durable, replayable event log | Event sourcing, analytics |
| Webhooks | External system integration | HTTP callbacks |

### 3. Design Event Schema

```typescript
interface Event<T> {
  id: string;           // Unique event identifier (UUID)
  type: string;         // Event type (e.g., "ORDER_PLACED")
  version: string;      // Schema version for evolution
  timestamp: string;    // ISO 8601 timestamp
  source: string;       // Origin service name
  data: T;             // Event payload
  metadata?: Record<string, unknown>;  // Optional tracing/correlation
}
```

### 4. Handle Eventual Consistency

- Design consumers to be **idempotent** (safe to process twice)
- Use **correlation IDs** to track event chains
- Implement **dead letter queues** for failed processing
- Set **retry policies** with exponential backoff

### 5. Ensure Durability

- Use persistent message storage (not in-memory)
- Acknowledge messages only after successful processing
- Implement **at-least-once** delivery semantics

## Examples

### TypeScript Event Emitter

```typescript
interface OrderEvent {
  orderId: string;
  customerId: string;
  total: number;
  items: OrderItem[];
}

class OrderEventPublisher {
  private emitter: EventEmitter;

  async publishOrderPlaced(event: OrderEvent): Promise<void> {
    const message: Event<OrderEvent> = {
      id: crypto.randomUUID(),
      type: 'ORDER_PLACED',
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'order-service',
      data: event,
      metadata: {
        correlationId: event.orderId,
        partitionKey: event.customerId
      }
    };

    await this.messageBroker.publish('orders.placed', message);
  }
}
```

### Message Consumer with Retry

```typescript
class OrderEventConsumer {
  async handleOrderPlaced(event: Event<OrderEvent>): Promise<void> {
    try {
      // Idempotent processing
      const existingOrder = await this.orderRepo.findById(event.data.orderId);
      if (existingOrder) {
        logger.info('Order already processed, skipping', { orderId: event.data.orderId });
        return;
      }

      await this.orderService.processOrder(event.data);
      await this.messageBroker.ack(event.id);
    } catch (error) {
      if (error instanceof TransientError) {
        // Requeue with delay for retry
        await this.messageBroker.requeue(event.id, { delay: 5000 });
      } else {
        // Send to dead letter queue
        await this.messageBroker.sendToDlq(event, error);
      }
    }
  }
}
```

### Event Schema Registry

```typescript
// contracts/order-events.ts
export const OrderPlacedEventSchema = {
  type: 'object',
  required: ['orderId', 'customerId', 'total', 'items'],
  properties: {
    orderId: { type: 'string', format: 'uuid' },
    customerId: { type: 'string', format: 'uuid' },
    total: { type: 'number', minimum: 0 },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['productId', 'quantity', 'price'],
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number', minimum: 1 },
          price: { type: 'number', minimum: 0 }
        }
      }
    }
  }
};
```

## Related Skills

- api-design
- backend-patterns
- cqrs
- event-sourcing
- message-queues
