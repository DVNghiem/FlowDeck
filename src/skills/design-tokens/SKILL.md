---
name: design-tokens
description: Design token system with semantic color palettes, typography scales, spacing systems, and W3C DTCG compliant token definitions
origin: Built for FlowDeck's design agent workflow
tags:
  - design
  - tokens
  - semantic
  - w3c-dtcg
  - color
  - typography
  - spacing
---

# Design Tokens Skill

Design tokens are the single source of truth for visual design decisions. They enable consistent, themeable UI and bridge design tools with code.

## Token Structure

Tokens follow W3C Design Token Community Group (DTCG) format:

```css
/* Category/Role/Variant */
--color-text-primary: oklch(68% 0.21 250);
--color-surface: oklch(98% 0 0);
--spacing-lg: 1.5rem; /* 24px */
--radius-md: 0.5rem; /* 8px */
```

## Color Tokens

### Semantic Color Palette (Light Mode)

```css
:root {
  /* Text Colors */
  --color-text-primary: oklch(18% 0 0);        /* #1a1a1a - Main text */
  --color-text-secondary: oklch(45% 0 0);     /* #6b6b6b - Secondary text */
  --color-text-tertiary: oklch(65% 0 0);      /* #a3a3a3 - Muted text */
  --color-text-inverse: oklch(98% 0 0);        /* White text on dark */

  /* Surface Colors */
  --color-surface: oklch(98% 0 0);             /* #fafafa - Background */
  --color-surface-elevated: oklch(100% 0 0);  /* #ffffff - Cards, modals */
  --color-surface-overlay: oklch(0% 0 0 / 50%); /* #00000050 - Overlays */

  /* Interactive Colors */
  --color-interactive-primary: oklch(68% 0.21 250);  /* Blue - CTAs */
  --color-interactive-hover: oklch(62% 0.22 250);     /* Darker blue */
  --color-interactive-active: oklch(55% 0.24 250);   /* Even darker */
  --color-interactive-disabled: oklch(85% 0 0);       /* Gray - Disabled */

  /* Feedback Colors */
  --color-success: oklch(72% 0.19 145);       /* Green */
  --color-warning: oklch(85% 0.18 85);         /* Yellow/Orange */
  --color-error: oklch(63% 0.24 25);          /* Red */
  --color-info: oklch(68% 0.21 250);          /* Blue - same as primary */

  /* Border Colors */
  --color-border: oklch(90% 0 0);              /* Light gray border */
  --color-border-strong: oklch(75% 0 0);      /* Stronger border */
  --color-border-interactive: oklch(68% 0.21 250); /* Focus ring */
}
```

### Dark Mode Tokens

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-text-primary: oklch(92% 0 0);
    --color-text-secondary: oklch(70% 0 0);
    --color-surface: oklch(15% 0 0);
    --color-surface-elevated: oklch(22% 0 0);
    --color-interactive-primary: oklch(75% 0.2 250);
  }
}
```

## Typography Tokens

```css
:root {
  /* Font Families */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Type Scale */
  --text-xs: 0.75rem;     /* 12px - Captions */
  --text-sm: 0.875rem;   /* 14px - Small text */
  --text-base: 1rem;     /* 16px - Body */
  --text-lg: 1.125rem;   /* 18px - Large body */
  --text-xl: 1.25rem;    /* 20px - Subheadings */
  --text-2xl: 1.5rem;    /* 24px - Section titles */
  --text-3xl: 1.875rem;  /* 30px - Page titles */
  --text-4xl: 2.25rem;   /* 36px - Hero */
  --text-hero: clamp(3rem, 1rem + 7vw, 8rem); /* Responsive hero */

  /* Line Heights */
  --leading-tight: 1.1;
  --leading-snug: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* Letter Spacing */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;

  /* Font Weights */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
}
```

## Spacing Tokens

```css
:root {
  /* Base: 4px */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;       /* 16px */
  --space-5: 1.5rem;     /* 24px */
  --space-6: 2rem;       /* 32px */
  --space-8: 3rem;       /* 48px */
  --space-10: 4rem;      /* 64px */
  --space-12: 6rem;      /* 96px */
  --space-section: clamp(4rem, 3rem + 5vw, 10rem); /* Responsive section spacing */
}
```

## Shadow & Elevation Tokens

```css
:root {
  /* Shadows */
  --shadow-sm: 0 1px 2px oklch(0% 0 0 / 5%);
  --shadow-md: 0 4px 6px -1px oklch(0% 0 0 / 10%), 0 2px 4px -2px oklch(0% 0 0 / 10%);
  --shadow-lg: 0 10px 15px -3px oklch(0% 0 0 / 10%), 0 4px 6px -4px oklch(0% 0 0 / 10%);
  --shadow-xl: 0 20px 25px -5px oklch(0% 0 0 / 10%), 0 8px 10px -6px oklch(0% 0 0 / 10%);
  --shadow-glow: 0 0 20px oklch(68% 0.21 250 / 30%);

  /* Elevation (for layering) */
  --elevation-1: 0 1px 3px var(--shadow-sm);
  --elevation-2: 0 4px 6px var(--shadow-md);
  --elevation-3: 0 10px 15px var(--shadow-lg);
}
```

## Border Radius Tokens

```css
:root {
  --radius-sm: 0.25rem;   /* 4px - Small elements */
  --radius-md: 0.5rem;    /* 8px - Buttons, inputs */
  --radius-lg: 0.75rem;   /* 12px - Cards */
  --radius-xl: 1rem;      /* 16px - Modals */
  --radius-2xl: 1.5rem;  /* 24px - Large containers */
  --radius-full: 9999px;  /* Pills, avatars */
}
```

## Animation Tokens

```css
:root {
  /* Durations */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  /* Easing */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## Token Naming Conventions

Follow semantic naming — describe **purpose**, not value:

```css
/* WRONG - describes the value */
--color-blue-600: #2563eb;
--space-16: 4rem;

/* CORRECT - describes the role */
--color-interactive-primary: #2563eb;
--space-section: 4rem;
```

## Token Categories

| Category | Prefix | Example |
|----------|--------|---------|
| Color | `--color-` | `--color-text-primary` |
| Typography | `--typography-` | `--typography-heading-1` |
| Spacing | `--space-` | `--space-lg` |
| Sizing | `--size-` | `--size-icon-md` |
| Border | `--radius-` | `--radius-lg` |
| Shadow | `--shadow-` | `--shadow-md` |
| Motion | `--duration-`, `--ease-` | `--duration-fast` |

## Exporting Tokens

Tokens can be exported to multiple formats:

```bash
# Using Style Dictionary
npx style-dictionary build

# Generates:
# - tokens.css (CSS custom properties)
# - tokens.json (raw JSON)
# - tokens.js (CommonJS module)
# - tokens.d.ts (TypeScript definitions)
```

## Applying Tokens in Components

```css
/* Reference tokens, never hardcode */
.component {
  color: var(--color-text-primary);
  background: var(--color-surface);
  padding: var(--space-lg);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: var(--text-base);
  transition: all var(--duration-fast) var(--ease-out-expo);
}
```

## Figma Integration

When using Figma MCP, extract tokens from:

1. **Color styles** → Map to `--color-*` tokens
2. **Text styles** → Map to `--typography-*` tokens
3. **Effect styles** → Map to `--shadow-*` tokens
4. **Auto layout spacing** → Map to `--space-*` tokens
5. **Component properties** → Map to semantic role tokens

Tokens bridge the gap between design tools and code — they ensure that what designers specify in Figma translates directly to production code.