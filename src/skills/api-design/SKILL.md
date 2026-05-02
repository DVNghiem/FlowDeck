---
name: api-design
description: REST API design patterns for resource naming, status codes, pagination, filtering, versioning, and error responses. Activate when designing or reviewing API endpoints.
origin: FlowDeck
---

# API Design Skill

REST API design patterns. Consistent, predictable, and easy to use.

## When to Activate

Activate when:
- Designing new API endpoints
- Reviewing existing API for inconsistencies
- Adding a new resource to an existing API
- Evaluating an external API design

## Core Principles

- **Nouns, not verbs** in URLs — resources, not actions
- **Consistent naming** — same conventions throughout
- **Standard status codes** — use what HTTP intended
- **No breaking changes** without versioning

## Resource Design

```
✅ Good:
GET    /api/v1/users           — list users
GET    /api/v1/users/:id       — get user by ID
POST   /api/v1/users           — create user
PUT    /api/v1/users/:id       — replace user
PATCH  /api/v1/users/:id       — update user fields
DELETE /api/v1/users/:id       — delete user

❌ Bad:
GET  /getUsers
POST /createUser
GET  /deleteUser?id=123
```

## HTTP Methods and Status Codes

| Method | Success Code | Use For |
|--------|-------------|---------|
| GET | 200 OK | Retrieve resource(s) |
| POST | 201 Created | Create new resource |
| PUT | 200 OK | Replace entire resource |
| PATCH | 200 OK | Update specific fields |
| DELETE | 204 No Content | Delete resource |

**Error codes:**
| Code | Meaning |
|------|---------|
| 400 | Bad Request — malformed request body |
| 401 | Unauthorized — missing or invalid auth token |
| 403 | Forbidden — authenticated but not authorized |
| 404 | Not Found — resource does not exist |
| 409 | Conflict — duplicate resource |
| 422 | Unprocessable — valid format, failed validation |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error — unexpected server failure |

## Error Response Format

All errors use this standard shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is invalid",
    "details": [
      { "field": "email", "message": "Must be a valid email address" }
    ]
  }
}
```

## Pagination

**Offset-based** (simple, but slow on large datasets):
```
GET /api/v1/users?page=2&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 847,
    "pages": 43
  }
}
```

**Cursor-based** (efficient, consistent):
```
GET /api/v1/users?after=cursor_abc123&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "nextCursor": "cursor_def456",
    "hasMore": true
  }
}
```

## Filtering and Sorting

```
GET /api/v1/users?filter[status]=active
GET /api/v1/users?filter[role]=admin&filter[status]=active
GET /api/v1/users?sort=-createdAt          // descending
GET /api/v1/users?sort=lastName,firstName  // multiple fields
```

## Versioning Strategy

Version in the URL path:
```
/api/v1/users     — current stable
/api/v2/users     — new version with breaking changes
```

Rules:
- Never change v1 behavior once published
- Keep v1 running for at least 12 months after v2 ships
- Document migration guide in CHANGELOG

## Rate Limiting Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1609459200
```

Return 429 when limit exceeded with `Retry-After` header.
