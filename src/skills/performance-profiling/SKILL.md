---
name: performance-profiling
description: CPU and memory profiling, N+1 query detection, bundle analysis, and render optimization. Activate when diagnosing slow performance or before production deployments.
origin: FlowDeck
---

# Performance Profiling Skill

Finds real performance bottlenecks using data. Never optimize without measuring first.

## When to Activate

Activate when:
- Users report slow responses
- A page or endpoint takes longer than expected
- Before a production deployment of performance-sensitive changes
- After adding features to a hot code path

## Core Principles

- **Measure before optimizing** — a guess about the bottleneck is almost always wrong
- **Profile the real bottleneck** — top-line metrics first, then drill down
- **Verify improvement with numbers** — "feels faster" is not a performance result

## Workflow

1. **Establish baseline** — measure current performance with actual numbers
2. **Profile** — find where time is spent
3. **Identify bottleneck** — the one slowest thing
4. **Fix** — targeted change to address bottleneck
5. **Measure improvement** — confirm the number improved

## Profiling Tools

```bash
# Node.js CPU profiling
node --prof app.js
node --prof-process isolate-*.log | head -100

# Clinic.js (visual profiler)
npm install -g clinic
clinic doctor -- node app.js
clinic flame -- node app.js   # flame graph

# Lighthouse (web performance)
npx lighthouse http://localhost:3000 --output=json --output-path=./report.json

# Bundle analyzer
npx webpack-bundle-analyzer dist/stats.json
```

## Core Web Vitals Targets

| Metric | Good | Needs Work | Poor |
|--------|------|-----------|------|
| LCP | < 2.5s | 2.5s-4s | > 4s |
| FID | < 100ms | 100ms-300ms | > 300ms |
| CLS | < 0.1 | 0.1-0.25 | > 0.25 |
| TTFB | < 800ms | 800ms-1.8s | > 1.8s |

## N+1 Detection

```typescript
// ❌ N+1 — 1 query for posts, N queries for authors
const posts = await Post.findAll();
for (const post of posts) {
  post.author = await User.findById(post.authorId); // N queries!
}

// ✅ Single query with JOIN
const posts = await Post.findAll({
  include: [{ model: User, as: 'author' }]
});
```

Detection: add query logging and look for repeated queries with different IDs.

## Bundle Analysis

```bash
# Generate stats
npm run build -- --stats

# Analyze
npx webpack-bundle-analyzer dist/stats.json

# What to look for:
# - Large libraries that could be replaced with smaller alternatives
# - Libraries imported in full that should be tree-shaken
# - Duplicate dependencies at different versions
```

## React Render Profiling

```typescript
// React DevTools Profiler — open in browser DevTools → Profiler tab
// Record a user interaction, look for:
// - Components rendering too often
// - Renders taking >16ms (drops frame rate)

// why-did-you-render (development only)
import whyDidYouRender from '@welldone-software/why-did-you-render';
whyDidYouRender(React, { trackAllPureComponents: true });
```

## Memory Leak Patterns

```typescript
// ❌ Event listener never removed
useEffect(() => {
  document.addEventListener('click', handler);
}, []);

// ✅ Cleanup
useEffect(() => {
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}, []);

// ❌ Interval never cleared
useEffect(() => {
  setInterval(poll, 5000);
}, []);

// ✅ Clear on unmount
useEffect(() => {
  const id = setInterval(poll, 5000);
  return () => clearInterval(id);
}, []);
```

## Performance Report Template

```markdown
## Performance Report

### Baseline
- Endpoint: GET /api/v1/users
- P50: 340ms | P95: 1200ms | P99: 3400ms
- Measured with: autocannon, 100 concurrent connections

### Bottleneck
- Root cause: N+1 query — 1 query per user to fetch their role
- Evidence: query log shows 47 queries for 47 users

### Fix
- Single JOIN query in UserRepository.findAllWithRoles()
- File: src/db/user-repo.ts

### After
- P50: 42ms | P95: 98ms | P99: 210ms
- Improvement: 87% faster at P50
```
