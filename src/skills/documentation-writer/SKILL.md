---
name: documentation-writer
description: Writes technical documentation including README, API docs, changelogs, and inline comments. Activate when documentation needs to be created or updated.
origin: FlowDeck
---

# Documentation Writer Skill

Writes documentation that developers actually read. Accurate over comprehensive. Examples over prose.

## When to Activate

Activate when:
- New code was written and needs documentation
- Existing docs are outdated or wrong
- A README needs to be created
- API docs need to be updated after a signature change

## Core Principles

- **Accurate over comprehensive** — wrong docs are worse than no docs
- **Examples over prose** — show, don't describe
- **Keep it current** — every code change triggers a doc review

## Workflow

1. Identify what changed (git diff)
2. Find affected documentation (grep for function/class names)
3. Update each doc with accurate content
4. Verify all code examples work

## README Structure

```markdown
# Project Name

One-sentence description of what this does.

[![Build](badge)] [![Coverage](badge)] [![License](badge)]

## Quick Start

```bash
npm install my-package
```

```typescript
import { myFunction } from 'my-package';
const result = myFunction('input');
```

## Installation

```bash
npm install my-package
# or
yarn add my-package
```

## Usage

[Most common use cases with working examples]

## API Reference

[Link to detailed API docs or inline for small libraries]

## Contributing

[How to contribute, run tests, submit PRs]

## License

MIT
```

## API Doc Format

```markdown
### `functionName(param1, param2?)`

One sentence: what it does.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| param1 | string | Yes | The user's email address |
| param2 | Options | No | Config (default: `{}`) |

**Returns:** `Promise<User>` — the created user.

**Throws:** `ValidationError` if email is invalid.

**Example:**
```typescript
const user = await createUser('me@example.com');
console.log(user.id); // "usr_abc123"
```
```

## Changelog Format

Follow [Keep a Changelog](https://keepachangelog.com):

```markdown
## [Unreleased]

### Added
- User can now reset password via email link

### Fixed
- Login button was disabled after failed attempt

### Changed
- `createUser()` now accepts `Options` instead of separate parameters

### Deprecated
- `getUserData()` — use `fetchUserProfile()` instead

### Removed
- Removed `legacyAuth()` (deprecated in v1.1)
```

## Inline Comment Guidelines

**DO comment:**
```typescript
// Binary search: O(log n) — dataset is always sorted on insert
function findUser(users: User[], id: string): User | null { ... }

// WARNING: mutates input array for performance — clone before passing if needed
function sortInPlace(items: Item[]): void { ... }

// Using exponential backoff: API rate limit is 1 req/sec sustained
async function fetchWithRetry(url: string, retries = 3): Promise<Response> { ... }
```

**DON'T comment:**
```typescript
// increment counter
counter++;

// return user email
return user.email;
```

## Quality Checklist

- [ ] All code examples are syntactically correct
- [ ] Examples work when pasted into the project
- [ ] No dead links
- [ ] Consistent terminology throughout
- [ ] README quick start works on a fresh clone
- [ ] Changelog entry added for all meaningful changes
