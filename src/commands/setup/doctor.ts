import type { CommandContext } from "../../types/command-context"
import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

export const doctorCommand = {
  name: "fd-doctor",
  description: "Check FlowDeck installation and environment health",
  async execute(context: CommandContext) {
    const results: string[] = ["# FlowDeck Doctor Report", ""]
    let healthy = true

    // 1. Check OpenCode version
    try {
      const version = execSync("opencode --version", { encoding: "utf-8" }).trim()
      results.push(`- [x] OpenCode detected: ${version}`)
    } catch {
      results.push("- [ ] OpenCode CLI not found on PATH")
      healthy = false
    }

    // 2. Check Plugin Config
    const configDir = process.env.OPENCODE_CONFIG_DIR || join(process.env.HOME || "", ".config", "opencode")
    const configFile = join(configDir, "opencode.json")
    if (existsSync(configFile)) {
      try {
        const cfg = JSON.parse(readFileSync(configFile, "utf-8"))
        if (cfg.plugin && cfg.plugin.includes("@dv.nghiem/flowdeck")) {
          results.push(`- [x] FlowDeck registered in ${configFile}`)
        } else {
          results.push(`- [ ] FlowDeck NOT registered in ${configFile}`)
          healthy = false
        }
      } catch {
        results.push("- [ ] opencode.json is malformed")
        healthy = false
      }
    } else {
      results.push(`- [ ] Configuration file ${configFile} not found`)
      healthy = false
    }

    // 3. Check Workspace State
    const dir = context.directory ?? process.cwd()
    const statePath = join(dir, ".planning", "STATE.md")
    if (existsSync(statePath)) {
      results.push("- [x] .planning/STATE.md exists in current workspace")
    } else {
      results.push("- [!] No .planning/STATE.md found (run /new-project to initialize)")
    }

    results.push("", healthy ? "✅ Environment looks healthy!" : "❌ Some issues were found. Please check the report above.")

    return {
      content: results.join("\n"),
      healthy
    }
  }
}
