---
name: dependency-audit
description: Audits npm/pip/cargo dependencies for known vulnerabilities, outdated packages, and license issues. Activate before releases or when CVE alerts are received.
origin: FlowDeck
---

# Dependency Audit Skill

Checks dependencies for security vulnerabilities, outdated versions, and license issues before they cause problems in production.

## When to Activate

Activate when:
- Preparing a production release
- Receiving a CVE alert for a dependency
- Adding a major new dependency
- It has been more than 30 days since last audit

## Core Principles

- **Security over convenience** — patch vulnerabilities before releasing
- **Patch before releasing** — critical and high findings block deployment
- **License compliance matters** — GPL in a commercial product can create legal problems

## Workflow

1. Run security audit commands
2. Triage findings by severity
3. Check for outdated packages
4. Check licenses of key dependencies
5. Produce report with recommended actions

## Audit Commands

```bash
# npm
npm audit                          # all vulnerabilities
npm audit --audit-level=moderate   # moderate and above
npm audit fix                      # auto-fix safe upgrades
npm audit fix --force              # force fix (may break things — test first)

# Check outdated packages
npm outdated

# Snyk (more comprehensive)
npx snyk test
npx snyk monitor

# Python
pip-audit                          # install: pip install pip-audit
pip list --outdated

# Rust
cargo audit                        # install: cargo install cargo-audit

# Check licenses
npx license-checker --summary
npx license-checker --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC'
```

## Severity Triage

| Severity | Action | Timeline |
|----------|--------|---------|
| Critical | Fix immediately — do not deploy | Before next commit |
| High | Fix before release | Before next deployment |
| Moderate | Fix in next sprint | Within 2 weeks |
| Low | Track and fix eventually | Next maintenance window |

## Common Vulnerability Patterns

- **Prototype pollution** — lodash <4.17.21, merge-deep <3.0.3
- **Path traversal** — file utility packages that accept user-controlled paths
- **ReDoS** — regex-based parsers (moment.js, validator.js older versions)
- **Command injection** — packages that shell out with user-controlled input

## Update Strategy

| Change Type | Safety | Action |
|-------------|--------|--------|
| Patch (x.y.Z) | Very safe | Update immediately |
| Minor (x.Y.z) | Safe with tests | Update, run full test suite |
| Major (X.y.z) | Breaking changes likely | Read changelog, test thoroughly |

```bash
# Safe patch/minor updates
npm update                         # updates within version constraints
npx npm-check-updates -u --target patch  # update only patches
```

## License Audit

| License | Commercial Use | Notes |
|---------|---------------|-------|
| MIT | ✅ Safe | Most permissive |
| Apache 2.0 | ✅ Safe | Patent grant included |
| BSD-2/3 | ✅ Safe | Attribution required |
| ISC | ✅ Safe | MIT equivalent |
| LGPL | ⚠️ Check | OK if only linking to it |
| GPL | ❌ Risky | Legal review required for commercial |
| AGPL | ❌ Risky | Strongest copyleft — legal review required |
| Unknown | ❌ Investigate | Do not ship until license is known |

## Output Format

```markdown
## Dependency Audit Report

### Vulnerabilities
| Package | Severity | CVE | Fix |
|---------|----------|-----|-----|
| lodash@4.17.19 | High | CVE-2021-23337 | Upgrade to 4.17.21 |

### Outdated Packages (Major Versions)
| Package | Current | Latest | Breaking Changes |
|---------|---------|--------|-----------------|
| express | 4.17.3 | 5.0.0 | Yes — read changelog |

### License Issues
| Package | License | Issue |
|---------|---------|-------|
| some-pkg | GPL-3.0 | Requires legal review for commercial use |

### Verdict: PASS ✅ | FAIL ❌
FAIL if any Critical or High vulnerabilities remain unfixed.
```
