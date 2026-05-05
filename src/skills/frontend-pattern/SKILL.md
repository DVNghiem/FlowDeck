---
name: frontend-pattern
description: Frontend development patterns — component composition, state management, URL-as-state, data fetching, and animation best practices for React/TypeScript web applications
origin: FlowDeck
---

# Frontend Pattern Skill

Implements maintainable, performant frontend patterns using React and TypeScript.

## When to Activate

Activate when:
- Building new UI components
- Setting up state management
- Implementing data fetching
- Adding animations or transitions
- Structuring a new feature module

## Component Patterns

### Compound Components

Use compound components when related UI shares state and interaction semantics:

```tsx
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="overview">...</Tabs.Content>
  <Tabs.Content value="settings">...</Tabs.Content>
</Tabs>
```

- Parent owns state via `useState` or context
- Children consume via context — no prop drilling
- Keeps keyboard handling, ARIA, and focus logic in the headless layer

### Container / Presentational Split

```tsx
// Container — owns data loading and side effects
function UserProfileContainer({ userId }: { userId: string }) {
  const { data, isLoading } = useUser(userId);
  if (isLoading) return <Skeleton />;
  return <UserProfileView user={data} />;
}

// Presentational — receives props, renders UI
function UserProfileView({ user }: { user: User }) {
  return (
    <div>
      <Avatar src={user.avatar} />
      <h1>{user.name}</h1>
    </div>
  );
}
```

## State Management

| Concern | Tooling |
|---------|---------|
| Server state | TanStack Query, SWR, tRPC |
| Client state | Zustand, Jotai, signals |
| URL state | search params, route segments |
| Form state | React Hook Form or equivalent |

**Do not duplicate server state into client stores.** Derive values instead of storing redundant computed state.

## URL As State

Persist shareable, bookmarkable state in the URL:

```tsx
// Good: filters, sort, pagination in URL
const [searchParams, setSearchParams] = useSearchParams();
const filter = searchParams.get('filter') ?? 'all';

// Usage
<button onClick={() => setSearchParams({ filter: 'active' })}>
  Active
</button>
```

## Data Fetching Patterns

### Stale-While-Revalidate

Return cached data immediately, revalidate in background:

```tsx
const { data } = useQuery({
  queryKey: ['users', userId],
  queryFn: () => fetchUser(userId),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### Optimistic Updates

```tsx
const mutation = useMutation({
  mutationFn: updateUser,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['user', newData.id] });
    const previous = queryClient.getQueryData(['user', newData.id]);
    queryClient.setQueryData(['user', newData.id], newData);
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(['user', newData.id], context.previous);
  },
});
```

## CSS Custom Properties

Define design tokens as CSS variables — do not hardcode values:

```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-text: oklch(18% 0 0);
  --color-accent: oklch(68% 0.21 250);

  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --space-section: clamp(4rem, 3rem + 5vw, 10rem);

  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## Animation Guidelines

Use compositor-friendly properties only:

```
✅ transform, opacity, clip-path, filter
❌ width, height, top, left, margin, padding, border, font-size
```

```tsx
// Good
const style = { opacity: isVisible ? 1 : 0, transform: `translateY(${isVisible ? 0 : 20}px)` };

// Bad
const style = { height: isVisible ? 'auto' : 0 };
```

## Related Skills

- [code-review](code-review) — Review frontend code for quality
- [security-scan](security-scan) — Check for XSS and injection vulnerabilities
- [test-coverage](test-coverage) — Ensure UI component tests exist