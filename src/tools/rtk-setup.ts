import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { getRtkStatus } from "../services/rtk-manager"
import { getSupportedCommands } from "../services/rtk-policy"

/**
 * rtk-setup tool — agent-callable tool for rtk lifecycle management.
 *
 * Provides:
 * - Detection: is rtk installed and where?
 * - Optional init: run `rtk init -g` to install the bash hook
 * - Status report: for diagnostics in the current workflow
 * - Supported commands list: which commands benefit from rtk wrapping
 *
 * Agents should call this tool when:
 * - They want to verify rtk is available before running commands
 * - The workflow involves heavy CLI usage (git, tests, linting, docker)
 * - After a user has installed rtk and wants to activate it
 *
 * Note on bash hook: `rtk init -g` writes to Claude Code / Copilot global
 * config. In OpenCode's non-interactive bash sessions the hook may not fire
 * automatically. Use `$RTK_BIN <cmd>` explicitly as a reliable alternative
 * when RTK_INSTALLED=true in the environment.
 */
export const rtkSetupTool: ToolDefinition = tool({
  description: [
    "Detect, initialize, and report status of rtk (output compression proxy for CLI commands).",
    "rtk reduces noisy CLI output (git, npm, test runners, linters, docker) by 60-90%.",
    "Call this to check if rtk is available, to run `rtk init -g`, or to get the binary path.",
    "When RTK_INSTALLED=true in the environment, use `$RTK_BIN git status` for compressed output.",
  ].join(" "),
  args: {
    action: tool.schema
      .enum(["status", "init"])
      .optional()
      .describe(
        "'status' — detect and report rtk state (default). " +
          "'init' — detect, then run `rtk init -g` to install the bash hook. " +
          "Use 'init' only once per environment setup.",
      ),
  },
  async execute(args): Promise<string> {
    const action = args.action ?? "status"
    const runInit = action === "init"
    const status = getRtkStatus({ runInit })

    const lines: string[] = ["## rtk Status"]

    if (status.installed) {
      lines.push(`- **Installed**: yes`)
      lines.push(`- **Binary**: ${status.binPath ?? "rtk (in PATH)"}`)
      if (status.version) lines.push(`- **Version**: ${status.version}`)

      if (runInit) {
        if (status.initAttempted) {
          lines.push(
            `- **Init**: ${status.initSuccess ? "✓ succeeded (bash hook installed)" : "✗ failed"}`,
          )
          lines.push(
            `- **Telemetry**: ${status.telemetryDisabled ? "✓ disabled (`rtk telemetry disable` ran)" : "⚠ disable step failed — run `rtk telemetry disable` manually"}`,
          )
          if (status.initSuccess) {
            lines.push(
              "",
              "  **Bash hook caveat**: `rtk init -g` writes to Claude Code / Copilot global config.",
              "  Whether it fires in non-interactive shell sessions depends on the runtime.",
              "  For reliable compression, use `$RTK_BIN <cmd>` explicitly.",
              "  `RTK_TELEMETRY_DISABLED=1` is always injected into bash sessions by FlowDeck.",
            )
          }
        }
      } else {
        lines.push("- **Init**: not requested (pass `action: 'init'` to install bash hook)")
        lines.push("- **Telemetry**: `RTK_TELEMETRY_DISABLED=1` is always set in bash sessions by FlowDeck")
      }

      lines.push(
        "",
        "### Using rtk",
        "In bash commands, replace `git status` with `$RTK_BIN git status`.",
        "The `RTK_BIN` env var is injected by FlowDeck into every bash session when rtk is detected.",
        "",
        "### Supported commands",
        getSupportedCommands()
          .map((c) => `- \`${c}\``)
          .join("\n"),
      )
    } else {
      lines.push("- **Installed**: no", "")
      lines.push("### Install rtk")
      if (status.installInstructions) {
        lines.push("```", status.installInstructions, "```")
      }
      lines.push("", "After installing, call `rtk-setup` again to verify detection.")
    }

    return lines.join("\n")
  },
})

