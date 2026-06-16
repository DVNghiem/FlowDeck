---
description: Auto-generate hierarchical AGENTS.md files throughout the project for lean per-directory context injection.
---

Analyze the project structure and generate an AGENTS.md file in each significant directory.

Each AGENTS.md should contain:
1. Purpose of this directory (1-2 sentences)
2. Key files and what they do
3. Conventions specific to this directory (naming, patterns, gotchas)
4. Dependencies on other directories

Guidelines:
- Be concise — each file should be < 30 lines
- Focus on what an AI agent needs to know before editing files in this directory
- Root AGENTS.md = project overview + architecture + tech stack
- src/AGENTS.md = source structure + module boundaries
- Per-subdirectory AGENTS.md = specific conventions + key files

Start with: list all directories, then generate AGENTS.md for each.
Do not modify any existing source files.
