import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { mkdirSync, writeFileSync, existsSync } from "fs"
import { join } from "path"

// Resolved at import time — points to src/skills/ in the plugin's own source tree
const SKILLS_DIR = join(import.meta.dir, "..", "skills")

export const createSkillTool: ToolDefinition = tool({
  description:
    "Create a new reusable skill in the FlowDeck skill library (src/skills/). " +
    "Use this when you discover a repeatable pattern, solve a novel problem with human guidance, " +
    "or want to capture domain knowledge for future sessions.",
  args: {
    name: tool.schema
      .string()
      .describe("Unique kebab-case skill name, e.g. 'api-rate-limiting'"),
    description: tool.schema
      .string()
      .describe("One-sentence description of what this skill does"),
    content: tool.schema
      .string()
      .describe(
        "Full skill body in Markdown. Must include: ## When to Activate, ## Steps, and ## Examples sections.",
      ),
    tags: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional tags for categorisation, e.g. ['performance', 'typescript']"),
  },
  async execute(args): Promise<string> {
    const skillDir = join(SKILLS_DIR, args.name)
    const skillFile = join(skillDir, "SKILL.md")

    if (existsSync(skillFile)) {
      return (
        `Skill '${args.name}' already exists at ${skillFile}.\n` +
        `Use a different name or delete the existing skill directory first.`
      )
    }

    const tagLine = args.tags?.length ? `\ntags: [${args.tags.join(", ")}]` : ""
    const frontmatter = `---\nname: ${args.name}\ndescription: ${args.description}\norigin: FlowDeck (self-learned)${tagLine}\n---\n\n`
    const fullContent = frontmatter + args.content.trimStart()

    try {
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(skillFile, fullContent, "utf-8")
      return (
        `✓ Skill '${args.name}' created at ${skillFile}\n\n` +
        `The skill is now part of the FlowDeck library. Restart OpenCode to load it into the active session.`
      )
    } catch (err) {
      return `Error creating skill '${args.name}': ${(err as Error).message}`
    }
  },
})
