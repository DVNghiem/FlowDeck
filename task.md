# FlowDeck: Token Efficiency Rules

Add the following rules to 3 files. No other changes.

---

## 1. `src/agents/orchestrator.ts`

Add a new section **"Token Efficiency"** immediately after the "Write Permission Rules" section:

```
## Token Efficiency

### Before reading any file
Check if the content is already available:
- In the current context packet (Decisions, Recent context)
- In `~/.fd-plan/<slug>/<topic>/` artifacts already loaded this session
- In a prior subagent output already logged to context.md

If available → use it. Do NOT re-read.

### Before delegating to a subagent
Check if an existing function, module, or utility already solves the need:
1. Search `architecture.md` for relevant components.
2. Check `decisions.md` for prior technology choices.
3. Run `fdx-grep` on the keyword before asking a subagent to build something new.

If something already exists → delegate "extend X" not "build Y".

### Context packet discipline
Keep the context packet under 400 tokens. Omit any section that is empty or not
directly relevant to THIS subagent's task. Sending unused context is wasted tokens.

### Do not over-explore
Read only the files listed in affect.md for the current task.
Do not recursively read parent directories, unrelated modules, or files not in scope.
One targeted read beats three broad ones.

### Subagent instructions
Always include in every task() call:
"Reuse existing utilities and patterns. Do not introduce new abstractions when an
existing one fits. If unsure whether something exists, grep before building."
```

---

## 2. `src/agents/coder.ts`

Find the existing **"Match existing patterns"** rule and extend it with these lines
immediately after:

```
- **Reuse before build** — before writing a new utility, helper, or abstraction, grep
  the codebase for an existing one. Build only when nothing fits.
- **No speculative code** — do not add parameters, options, or abstractions "for
  future use". Implement exactly what the current task requires, nothing more.
- **Minimal imports** — import only what this file uses. Do not import entire modules
  when one function is needed.
- **No duplicate logic** — if the same logic exists elsewhere, extract and call it.
  Duplication is a bug, not a shortcut.
```

---

## 3. `src/commands/fd-task.md`

In **Step 3** (Explore in parallel, then ask), add a new rule to the "Question suppression rule" block:

```
### Reuse suppression rule

Before proposing a new component, service, or utility in architecture.md:
1. Check `~/.fd-plan/<slug>/architecture.md` — does something already cover this?
2. Grep the codebase for an existing implementation.

If something already exists → the architecture should extend it, not duplicate it.
Note in `architecture.md` under "Alternatives Considered":
"<name> — reused existing <component> instead of building new."
```
