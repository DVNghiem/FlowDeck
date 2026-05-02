# Security Standards

Security requirements that apply to all code. These are checked before every merge and deployment.

## Pre-Commit Security Checklist

Before every commit touching auth, data access, or API routes:

- [ ] No hardcoded credentials, API keys, or secrets
- [ ] All database queries use parameterized inputs (no string concatenation)
- [ ] Input validated at all API boundaries
- [ ] Auth middleware present on all protected routes
- [ ] No passwords, tokens, or sensitive data in log statements
- [ ] New dependencies checked for known CVEs (`npm audit`)

## Secret Management

```typescript
// ❌ NEVER — hardcoded secret
const JWT_SECRET = "my-super-secret-key-abc123";

// ✅ ALWAYS — environment variable
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
```

Rules:
- Use `process.env` for all secrets
- Use `.env.local` (never `.env`) for local development
- Add `.env*` to `.gitignore` (verify it's there)
- Use a secret manager (AWS Secrets Manager, Vault) in production
- Rotate any secret that was accidentally committed

## OWASP Top 10 Quick Reference

| ID | Vulnerability | One-Line Check |
|----|--------------|---------------|
| A01 | Broken Access Control | Does every protected route check auth AND authorization? |
| A02 | Cryptographic Failures | Is sensitive data encrypted in transit and at rest? |
| A03 | Injection | Are all queries parameterized? All shell commands sanitized? |
| A04 | Insecure Design | Is there rate limiting? Account lockout after failed logins? |
| A05 | Security Misconfiguration | Is debug mode off? Are default credentials changed? |
| A06 | Vulnerable Components | Does `npm audit` show zero critical/high? |
| A07 | Auth Failures | Are JWTs validated? Sessions invalidated on logout? |
| A08 | Integrity Failures | Is all user input validated before processing? |
| A09 | Logging Failures | Are errors logged? Are passwords/tokens excluded from logs? |
| A10 | SSRF | Are server-side URL fetches restricted to allowlisted domains? |

## Security Response Protocol

**If a secret is accidentally committed:**
1. Rotate the secret immediately — assume it is compromised
2. Force-push or use BFG Repo Cleaner to remove from git history
3. Audit access logs for the period the secret was exposed
4. Notify your security team

```bash
# Remove secret from git history (after rotating it)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/secret-file' \
  --prune-empty --tag-name-filter cat -- --all
```

## Input Validation Requirements

Validate at every trust boundary:

```typescript
// Required validations for every external input:
// 1. Type — is it a string? number? object?
// 2. Length — is it within expected bounds?
// 3. Format — does it match the expected pattern?
// 4. Range — for numbers, within acceptable range?

// ✅ Example with Zod
const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['user', 'admin']).default('user'),
});
```

For security-critical fields (passwords, tokens, IDs): **reject** invalid input, do not sanitize.

## Rate Limiting Requirements

All public-facing endpoints must have rate limiting:

```typescript
// Minimum rate limits:
// - Authentication endpoints: 5 attempts per minute per IP
// - Public API: 100 requests per minute per user/IP
// - Password reset: 3 attempts per hour per email
```
