# Quick Start — First 15 Minutes

Get FlowDeck installed and run your first feature workflow in under 15 minutes.

## Step 1: Install FlowDeck

```bash
curl -fsSL https://raw.githubusercontent.com/DVNghiem/flowdeck/main/install.sh | bash
```

See [Installation](installation.md) for alternative install methods.

## Step 2: Verify Installation

```bash
flowdeck doctor
```

Checks that FlowDeck is installed, the OpenCode plugin is loaded, and your environment is ready.

## Step 3: Map the Codebase

```bash
fd-map-codebase
```

Analyses the project and writes structured indexes to `.codebase/`. This is required before starting a feature — it gives all subsequent agents the context they need.

## Step 4: Start a Feature

```bash
fd-new-feature "hello world API"
```

Initializes feature context and creates a `FEATURE.md` file in the current phase directory. If `.planning/` does not exist yet, it is created automatically.

## Step 5: Discuss the Feature

```bash
fd-discuss
```

Runs structured Q&A to capture requirements, constraints, and decisions. Saves to `DISCUSS.md`.

## Step 6: Plan Implementation

```bash
fd-plan
```

Generates a wave-structured execution plan. When prompted, type `CONFIRM` to proceed.

The planner outputs a `PLAN.md` with task waves — groups of independent tasks that can run in parallel.

## Step 7: Execute

```bash
fd-execute
```

Implements the feature using TDD discipline. Parallel agents (architect, coder, tester, reviewer) work through the plan waves.

## What to Expect

After completing these steps you will have:

- A `.planning/` directory with full project state
- A `PLAN.md` with executable task breakdown
- Working code with tests
- Verification results from the review pipeline

## Next Steps

- [First Project → End-to-End Walkthrough](first-project.md) — see what the output files actually look like
