---
description: Review code quality, security, and conventions — runs parallel @reviewer + @security-auditor agents
argument-hint: "[file-pattern|dir|stage number]"
---

Run the FlowDeck code review workflow. Reviews can target:
- **Specific files or directories** — `fd-verify src/services/`
- **Git staged changes** — `fd-verify staged`
- **Full project** — `fd-verify`

## What Next?

1. **Fix issues found** → `/fd-fix-bug [issue]`
2. **Create deployment checkpoint** → `/fd-checkpoint`
3. **Deploy to production** → `/fd-deploy-check`
4. **View project dashboard** → `/fd-dashboard`

Type the number or command to proceed.