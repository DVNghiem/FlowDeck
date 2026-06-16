import { tool } from "@opencode-ai/plugin"
import { execSync, exec } from "child_process"
import { existsSync, mkdirSync, appendFileSync } from "fs"
import { join } from "path"

function isTmuxAvailable(): boolean {
  try { execSync("which tmux", { stdio: "ignore" }); return true }
  catch { return false }
}

function getTmuxSession(): string | null {
  return process.env.TMUX ? "flowdeck" : null
}

function ensureLogFile(logDir: string, taskId: string): string {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  const logFile = join(logDir, `${taskId}.log`)
  if (!existsSync(logFile)) appendFileSync(logFile, `Waiting for task ${taskId} to start...\n`)
  return logFile
}

export const tmuxWatchTool = tool({
  description: "Open a tmux pane to watch a background agent task in real-time. Streams the agent's log output. Only works when running inside tmux.",
  args: {
    taskId: tool.schema.string(),
    logDir: tool.schema.string().optional(),
  },
  async execute(args, context) {
    if (!isTmuxAvailable()) return "tmux is not available on this system."
    if (!getTmuxSession()) return "Not running inside a tmux session. Start OpenCode inside tmux to use this feature."

    const logDir = args.logDir ?? join(context.directory, ".flowdeck", "logs")
    const logFile = ensureLogFile(logDir, args.taskId)

    exec(`tmux split-window -h "tail -f '${logFile}'; read"`)

    return `Opened tmux pane watching ${args.taskId}. Log: ${logFile}`
  },
})

export const tmuxDashboardTool = tool({
  description: "Open a tmux dashboard showing all active background agent tasks in split panes, one pane per agent.",
  args: {
    tasks: tool.schema.array(tool.schema.string()),
    logDir: tool.schema.string().optional(),
  },
  async execute(args, context) {
    if (!isTmuxAvailable()) return "tmux is not available."
    if (!getTmuxSession()) return "Not running inside tmux."

    const logDir = args.logDir ?? join(context.directory, ".flowdeck", "logs")

    for (const taskId of args.tasks) {
      const logFile = ensureLogFile(logDir, taskId)
      exec(`tmux split-window "tail -f '${logFile}'; read"`)
    }

    exec("tmux select-layout tiled")
    return `Dashboard opened with ${args.tasks.length} panes. Tasks: ${args.tasks.join(", ")}`
  },
})
