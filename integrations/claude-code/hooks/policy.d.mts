export type PolicyDecision = { decision: "allow" | "ask" | "deny"; reason: string }

export function decide(event: {
  tool_name?: string
  tool_input?: { command?: string; file_path?: string; path?: string; notebook_path?: string }
  cwd?: string
}): PolicyDecision
