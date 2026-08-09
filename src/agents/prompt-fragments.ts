/**
 * Shared prompt fragments composed into multiple agent prompts.
 *
 * Before this module the `## Token Optimization` section was inlined verbatim in
 * nine agent factories (`architect`, `coder`, `debug`, `mapper`, `planner`,
 * `researcher`, `reviewer`, `security-auditor`, `tester`), byte-identical in all
 * of them. Any tool-policy change therefore meant a nine-file sweep, and
 * `tests/agents/index.test.ts` only asserted that the section heading existed —
 * never its content — so a partial edit could pass CI.
 *
 * Keep policy that applies to every worker agent here, not in the individual
 * factories.
 */

/**
 * Token-efficiency and tool-preference policy shared by every worker agent.
 *
 * Interpolate where the `## Token Optimization` heading used to sit. The string
 * has no trailing newline, so the blank line that already separated this section
 * from the next `## ` heading is preserved by the call site.
 *
 * Note the single-writer rule on `fdx-graph`: `fdx graph build` does not wait on
 * lock contention (`crates/fdx/src/commands/graph/lock.rs:83`), so a parallel
 * wave would have every agent but one receive "another build is in progress".
 * That is not an fdx failure and must never trigger the grep fallback below.
 * Only the orchestrator runs `action:build`.
 */
export const TOKEN_OPTIMIZATION = `## Token Optimization

**Read as little as possible before acting:**
- State which files you need to read and why, before reading them.
- Read only files directly relevant to the task.
- Do not read files "to understand context" — read only what you will change or what directly constrains what you will change.

**Tool selection — always prefer the cheaper option:**
- Call FDX tools directly through OpenCode using their declared fields. FDX tools are
  not Bash commands: never put an \`fdx-*\` name or CLI flags in a shell command.
- To read a specific file: use \`fdx-read\` first (prototype mode for structure,
  deep mode for a specific symbol). Fall back to \`read\`/\`read_file\` only if
  fdx errors, times out, or returns empty/wrong output.
- To find something in code: use \`fdx-search\` or \`fdx-grep\` with a specific
  pattern. Fall back to native \`grep\`/\`glob\` only on fdx failure.
- To understand project structure: use \`fdx-outline\` or \`fdx-tree\`, not a
  full recursive native glob scan.
- To search across the codebase: use \`fdx-graph action:query\` for structural
  lookups (a symbol's callers, callees, imports) and \`fdx-graph action:impact\`
  for blast radius before an edit. Args are \`target\` and \`target2\` only —
  there is no depth or project-root argument. Otherwise \`fdx-grep\` — not bash
  find/grep loops.
- Use read-only graph actions only. The orchestrator owns \`action:build\`; if a
  graph call reports "another build is in progress", that is NOT an fdx failure
  — retry, do not fall back to grep.
- Never use \`bash\` just to read a file.
- Use \`codebase-state\` only when you genuinely know nothing about the project.
- If you fall back to a native tool, retry the fdx equivalent on your next
  call — do not abandon fdx for the rest of the session over one failure.

**Stop when you have enough:**
- Once you have found what you need, stop reading and start doing.
- Do not read additional files "to be sure" — trust what you found.
- If you realize mid-task that you need more files than initially scoped, stop and report to the orchestrator before continuing.

**Retry targeted, not broad:**
- If a step fails, re-read only the file or section related to the failure.
- Do not re-read the entire codebase after a single tool error.`;

/**
 * Orchestrator-context note appended after {@link TOKEN_OPTIMIZATION}.
 *
 * Only `architect` and `security-auditor` append this. `coder` carries the same
 * paragraph under `## General Rules` instead, at a different position, so it is
 * deliberately not hoisted here — see TODOS.md.
 */
export const ORCH_CONTEXT_NOTE = `**If the task description begins with \`## Orchestrator Context\`, treat its contents as already-researched ground truth. Do NOT re-run fdx-outline, fdx-impact, repo-memory, or codebase-state for information already present there. Start directly from the provided context. Only run additional research if you need something the context block does not cover.**`;
