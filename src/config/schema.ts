/**
 * FlowDeck configuration schema for `flowdeck.json`.
 *
 * Users can create this file at:
 *   - Global: ~/.config/opencode/flowdeck.json
 *   - Project: <project>/.opencode/flowdeck.json
 *
 * Project config takes precedence over global config.
 */

export interface AgentModelConfig {
  /** Model to use for this agent (e.g. "anthropic/claude-sonnet-4-5"). If not set, uses the currently selected model. */
  model?: string;
}

export interface FlowDeckConfig {
  /**
   * Per-agent model overrides. Keys are agent names (e.g. "orchestrator", "coder", "planner").
   * If an agent is not listed, it uses the model the user currently has selected in OpenCode.
   */
  agents?: Record<string, AgentModelConfig>;
}
