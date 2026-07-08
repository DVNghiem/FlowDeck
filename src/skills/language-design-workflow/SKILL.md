---
name: language-design-workflow
description: Structured workflow for designing a new programming language from scratch — systematic decision-making, cross-document consistency, and phased implementation planning
origin: session ses_0e5ee1c35ffea543nYlGHBUd6o (Ferrite language design, July 2026)
---

# Language Design Workflow

Systematic process for designing a new programming language: from research through 50+ design decisions to implementable specification and plan.

## When to Activate

Activate this skill when the user wants to:
- Design a new programming language from scratch
- Systematically explore and document language design decisions
- Create a language specification document from design decisions
- Audit cross-document consistency across design artifacts
- Any task involving "design a language" or "decide language features"

## Steps

### Step 1: Research Phase

Before making any decisions, research the design space thoroughly:

1. **Identify the design space dimensions** (at minimum):
   - Paradigm (functional, imperative, OOP, data-oriented, etc.)
   - Execution model (AOT, JIT, interpreted, transpiled)
   - Memory management (GC, ARC, ownership, regions)
   - Syntax families (curly braces, indentation, ML-style)
   - Type system (HM, gradual, dependent, nominal, structural)
   - Effect system (monads, algebraic effects, checked exceptions)
   - Metaprogramming (macros, comptime, templates)

2. **Research relevant languages** — web search for current state of each dimension
3. **Compile findings** to a research document that the design discussion references

### Step 2: Systematic Design Discussion

Use the `@discusser` agent for structured Q&A, one question at a time:

1. **Categorize decisions** into groups:
   - A: Implementation & Tooling
   - B: Execution Model
   - C: Memory Management
   - D: Language Name & Identity
   - E: Syntax & Grammar
   - F: Type System
   - G: Effect System
   - H: Semantics
   - I: Modules & Organization
   - J: Metaprogramming
   - K: Concurrency
   - L: Tooling

2. **For each category**, the discusser asks one question at a time and receives `needsInput` signals.

3. **Route needsInput signals** to `@supervisor` using the `question` tool:
   - Detect the `needsInput` JSON pattern: `{"ok": true, "needsInput": true, "question": {...}}`
   - Route to supervisor with the full question object
   - Wait for the supervisor result
   - Feed the answer back to the discusser via `task_id` resume

4. **Track decisions** with D-XX numbering (D-01, D-02, ...).

### Step 3: Document Creation

After all decisions are captured, create THREE standard documents:

1. **DECISIONS.md** — All D-XX entries with:
   - Date, Category, Context, Options, Decision, Rationale, Consequences
   - Cross-references between related decisions

2. **SPEC.md** — Living language specification:
   - Lexical structure (keywords, identifiers, literals)
   - Syntax grammar (productions)
   - Type system (kinds, types, trait system, effects)
   - Semantics (evaluation order, purity model)
   - Module system
   - Tooling & deferred features

3. **PLAN.md** — Phased implementation plan:
   - Phase overview table
   - Concrete steps per phase
   - Dependencies per step (D-XX references)
   - Verification checklists
   - Decision map cross-referencing D-XX to phases

### Step 4: Cross-Document Audit

Run a systematic audit across all three documents:

1. **Check internal consistency** — Do all three documents agree on each decision?
2. **Find missing decisions** — Are there implicit assumptions not captured as D-XX?
3. **Identify underspecified decisions** — Which D-XX entries need more detail to be implementable?
4. **Flag technical viability concerns** — Do any decisions conflict in practice?
5. **Verify phase ordering** — Can each step be implemented given its declared dependencies?
6. **List undecided questions** — What's still open?

### Step 5: Autonomous Resolution + Human Input

For each issue found in the audit:

1. **Autonomously resolve** issues where the existing decisions clearly imply the answer
2. **Route truly ambiguous questions** to the user via supervisor/question tool
3. **Update all three documents** with resolutions

### Step 6: Implementation Roadmap

Create a concrete execution guide (`IMPLEMENTATION_ROADMAP.md`):

1. Full Rust module tree (or appropriate language) with file paths
2. Detailed sub-tasks per step with code sketches
3. Key type definitions (Token, AST, Type, Runtime values)
4. Test specifications (what to test, edge cases)
5. Dependency graph with parallelization waves
6. Quick-start section (first file to write)

## Examples

### Example: Decision flow for type system questions

```
discusser: What type system? → needsInput → supervisor: question tool → user → orchestrator feeds answer → discusser: next question
```

### Example: D-XX decision record

```
### D-05: Execution Model
**Category:** Execution Model
**Context:** The language needs an execution strategy. Building a full optimizing compiler is the most work upfront.
**Options:** Direct-to-LLVM, Interpreter-first→LLVM later, Bytecode VM+JIT, Self-hosted
**Decision:** Interpreter first → LLVM backend later
**Rationale:** Faster bootstrap cycle, allows language iteration before committing to codegen.
**Consequences:** Phase 1 is interpreter-only, LLVM/codegen in Phase 2.
```

## Pitfalls

1. **Discusser loop too expensive** — 37+ rounds of discusser→supervisor is slow. Consider batching related questions or having the discusser group questions into mini-batches when decisions are clearly interdependent.

2. **Document drift** — After multiple update cycles, the three documents can drift out of sync. Always run the cross-document audit after any batch of changes.

3. **Under-specified decisions** — It's easy to say "GC" without specifying which GC algorithm. Every D-XX entry should be specific enough that someone could implement it from the description alone.

4. **Decision map staleness** — PLAN.md's decision map (D-XX → steps) will go stale as steps are reordered or split. Update it alongside every step addition.

5. **File write verification false negatives** — The verification checker may report written files as missing. Always verify file existence independently with `bash ls` or `read` tool before assuming write failure.
