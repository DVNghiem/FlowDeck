---
name: postgres-patterns
description: PostgreSQL schema, query, indexing, and performance patterns.
origin: FlowDeck
---

# postgres-patterns

## When to Activate
When designing database schemas, writing complex queries, or optimizing database performance. Use before creating migrations or writing SQL queries.

## Steps
1. **Design indexes strategically** - Create individual btree indexes on each column for multi-column searches (allows BitmapAnd)
2. **Use EXPLAIN ANALYZE** - Always verify query plans before and after optimization
3. **Choose correct index type** - B-tree for equality/range, Bloom for multi-column filters with high selectivity
4. **Avoid multi-column btree on non-leading columns** - Queries on non-first columns of multi-column btree indexes will do sequential scans
5. **Use parameterized queries** - Let the planner cache and reuse query plans
6. **Run ANALYZE regularly** - Keep statistics fresh for optimal planner decisions

## Examples

```sql
-- AVOID: Multi-column btree for non-leading column queries
CREATE INDEX btreeidx ON tbloom (i1, i2, i3, i4, i5, i6);
-- Query on i2 and i5 will do sequential scan, not use the index

-- PREFER: Individual btree indexes for multi-column searches
CREATE INDEX btreeidx1 ON tbloom (i1);
CREATE INDEX btreeidx2 ON tbloom (i2);
CREATE INDEX btreeidx3 ON tbloom (i3);
CREATE INDEX btreeidx4 ON tbloom (i4);
CREATE INDEX btreeidx5 ON tbloom (i5);
CREATE INDEX btreeidx6 ON tbloom (i6);
-- Bitmap Index Scan with BitmapAnd is used for multi-column queries
```

```sql
-- Bloom Index for multi-column filtering (good for low selectivity columns)
CREATE INDEX bloomidx ON tbloom USING bloom (i1, i2, i3, i4, i5, i6);
-- More efficient than btree for queries filtering on many columns
-- Smaller index size, faster Bitmap Index Scans

-- Always verify with EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM tbloom WHERE i2 = 898732 AND i5 = 123451;
```

```sql
-- Query Planner Configuration (temporary fix only)
SET enable_hashjoin = off;           -- Force nested-loop or merge join
SET enable_seqscan = off;           -- Prefer index scans
SET random_page_cost = 1.1;         -- Make index scans cheaper (SSD)
SET effective_cache_size = '8GB';   -- Help planner estimate

-- Better approaches:
-- 1. Run ANALYZE to update statistics
ANALYZE;
-- 2. Increase statistics for specific columns
ALTER TABLE orders SET STATISTICS = 500;
ANALYZE orders;
-- 3. Adjust planner cost constants (postgresql.conf)
```

```sql
-- Repository Pattern in SQL
-- Define standard operations
interface OrderRepository {
  findAll(filter: OrderFilter, pagination: Pagination): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  create(order: CreateOrderDTO): Promise<Order>;
  update(id: string, attributes: UpdateOrderDTO): Promise<Order>;
  delete(id: string): Promise<void>;
  count(filter?: OrderFilter): Promise<number>;
}
```

## Related Skills
- api-design
- backend-patterns
- database-migrations
- postgres-performance
