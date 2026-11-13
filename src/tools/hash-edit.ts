import { tool, type ToolDefinition } from "../compat/tool"
import { readFileSync, writeFileSync } from "fs"
import { createHash } from "crypto"

export const hashEditTool: ToolDefinition = tool({
  description: "Reliable file editing with content verification. Takes a target content, its expected MD5 hash, and replacement content. Only applies if the hash matches, preventing edits on stale file versions.",
  args: {
    filePath: tool.schema.string(),
    targetContent: tool.schema.string(),
    expectedHash: tool.schema.string().optional(),
    replacementContent: tool.schema.string(),
  },
  async execute(args, context) {
    const fullPath = args.filePath.startsWith("/") ? args.filePath : `${context.directory}/${args.filePath}`
    let content: string
    try {
      content = readFileSync(fullPath, "utf-8")
    } catch (e) {
      return `Error: Could not read file ${args.filePath}`
    }

    if (!content.includes(args.targetContent)) {
      return `Error: Target content not found in ${args.filePath}. It may have been modified by another agent.`
    }

    if (args.expectedHash) {
      const actualHash = createHash("md5").update(args.targetContent).digest("hex")
      if (actualHash !== args.expectedHash) {
        return `Error: Hash mismatch for target content. Expected ${args.expectedHash}, got ${actualHash}. Refusing to edit stale content.`
      }
    }

    const newContent = content.replace(args.targetContent, args.replacementContent)
    writeFileSync(fullPath, newContent, "utf-8")

    return `Successfully updated ${args.filePath} using hash-anchored edit.`
  },
})
