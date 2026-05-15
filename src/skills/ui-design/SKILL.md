---
name: ui-design
description: UI/visual design patterns, component templates, and layout best practices for creating attractive websites
origin: Built for FlowDeck's design agent workflow
tags:
  - design
  - ui
  - frontend
  - templates
  - components
  - layout
---

# UI Design Skill

This skill provides component templates, layout patterns, and design guidance for creating attractive, production-ready websites.

## Component Templates

### Buttons

```html
<!-- Primary Button -->
<button class="btn btn-primary">
  <span>Get Started</span>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
</button>

<!-- CSS -->
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: all var(--duration-fast) var(--ease-out-expo);
}

.btn-primary {
  background: var(--color-interactive-primary);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-primary:active {
  transform: translateY(0);
}
```

### Cards

```html
<div class="card">
  <div class="card-media">
    <img src="..." alt="..." loading="lazy"/>
  </div>
  <div class="card-body">
    <h3 class="card-title">Card Title</h3>
    <p class="card-description">Supporting text that explains the card content.</p>
    <div class="card-footer">
      <button class="btn btn-outline">Learn More</button>
    </div>
  </div>
</div>

<!-- CSS -->
.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--duration-normal) var(--ease-out-expo);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

### Forms

```html
<form class="form">
  <div class="form-group">
    <label for="email" class="form-label">Email Address</label>
    <input
      type="email"
      id="email"
      class="form-input"
      placeholder="you@example.com"
      autocomplete="email"
    />
    <span class="form-error">Please enter a valid email</span>
  </div>
  <button type="submit" class="btn btn-primary btn-full">Submit</button>
</form>

<!-- CSS -->
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-input {
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-interactive-primary);
  box-shadow: 0 0 0 3px var(--color-interactive-primary-alpha);
}

.form-error {
  color: var(--color-error);
  font-size: var(--typography-caption);
}
```

## Layout Patterns

### Hero Section

```html
<section class="hero">
  <div class="hero-content">
    <h1 class="hero-heading">Build Something Amazing</h1>
    <p class="hero-subheading">The modern platform for creating and deploying web applications.</p>
    <div class="hero-actions">
      <button class="btn btn-primary btn-lg">Get Started</button>
      <button class="btn btn-outline btn-lg">View Demo</button>
    </div>
  </div>
  <div class="hero-visual">
    <div class="hero-image"></div>
  </div>
</section>

<!-- CSS -->
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-section);
  align-items: center;
  padding: var(--space-section) 0;
}

.hero-heading {
  font-size: var(--text-hero);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.hero-subheading {
  font-size: var(--text-lg);
  color: var(--color-text-secondary);
  margin-top: 1.5rem;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}
```

### Bento Grid

```html
<div class="bento-grid">
  <div class="bento-item bento-tall bento-featured">
    <h3>Featured Content</h3>
    <p>Larger cell spanning multiple rows</p>
  </div>
  <div class="bento-item">
    <h3>Quick Stat</h3>
    <span class="stat-value">2.4M</span>
  </div>
  <div class="bento-item">
    <h3>Recent Activity</h3>
    <p>Compact info card</p>
  </div>
  <div class="bento-item bento-wide">
    <h3>Wide Card</h3>
    <p>Spans multiple columns</p>
  </div>
</div>

<!-- CSS -->
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-lg);
}

.bento-tall { grid-row: span 2; }
.bento-wide { grid-column: span 2; }
.bento-featured { background: var(--color-accent-surface); }
```

### Dashboard Layout

```html
<div class="dashboard">
  <aside class="sidebar">
    <nav class="nav">
      <a href="#" class="nav-item active">
        <svg class="icon"><!-- dashboard icon --></svg>
        Dashboard
      </a>
      <a href="#" class="nav-item">
        <svg class="icon"><!-- analytics icon --></svg>
        Analytics
      </a>
    </nav>
  </aside>
  <main class="main">
    <header class="page-header">
      <h1>Dashboard</h1>
      <button class="btn btn-primary">Create New</button>
    </header>
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Total Users</span>
        <span class="stat-value">12,345</span>
        <span class="stat-change positive">+8.2%</span>
      </div>
    </div>
  </main>
</div>
```

## Design Token Usage

**CRITICAL**: Always use semantic tokens, never hardcoded values.

```css
/* WRONG - hardcoded values */
color: #2563eb;
padding: 16px;
font-size: 18px;

/* CORRECT - semantic tokens */
color: var(--color-interactive-primary);
padding: var(--spacing-lg);
font-size: var(--typography-body-lg);
```

## Animation Principles

Use compositor-friendly properties only:
- `transform` (translate, scale, rotate)
- `opacity`
- `clip-path`

Avoid animating:
- `width`, `height`
- `margin`, `padding`
- `border`
- `font-size`

```css
/* Micro-interactions */
.card:hover {
  transform: translateY(-2px);
  opacity: 1;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Accessibility

- Color contrast: minimum 4.5:1 for normal text, 3:1 for large text
- Focus states: visible outline on keyboard navigation
- ARIA labels for icon-only buttons
- Semantic HTML: use `<button>` for actions, `<a>` for navigation

## Anti-Template Patterns

**STOP** — These look like generic templates, not intentional design:

- ❌ Uniform card grid with equal spacing everywhere
- ❌ Centered hero with gradient blob and "Get Started" CTA
- ❌ Sidebar with 5 identical nav items
- ❌ Flat gray background with white cards
- ❌ One font size used for everything

**DO** instead:
- ✓ Clear hierarchy through scale contrast
- ✓ Intentional rhythm in spacing (not uniform)
- ✓ Depth through shadows, overlap, or layering
- ✓ Typography with character and pairing strategy
- ✓ Hover/focus states that feel designed
- ✓ Grid-breaking editorial or bento composition