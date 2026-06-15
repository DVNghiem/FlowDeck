---
description: Engage autonomous orchestrator loop — keeps working until task is complete without human input between steps.
---

You are now in ULTRAWORK mode. The human has given you a task to complete fully autonomously.

Rules:
- Work until ALL steps in the execution path are complete.
- Do not stop after delegating to one agent and wait for human.
- After each agent completes, immediately route to the next agent in the chain.
- Use background-agent for parallel independent tasks.
- Only stop when: (a) all steps complete, (b) agent fails twice, or (c) human explicitly says stop.
- Update planning-state after each stage completes.

Task: {{task}}

Begin immediately. Do not ask clarifying questions unless a critical ambiguity makes any workflow choice impossible.
