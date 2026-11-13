/**
 * Compatibility shim for the OpenCode v2 plugin API.
 *
 * OpenCode v2 replaced the V1 `tool()` helper (`@opencode-ai/plugin`) with
 * plain tool definitions registered through `ctx.tool.transform`. The V2 shape
 * expects a JSON Schema `input` and a structured `Tool.Result`, while the V1
 * helper used zod `args` and let tools return plain strings.
 *
 * This module re-implements the V1 helper on top of zod (the same library the
 * V1 package re-exported), so FlowDeck tool modules keep their original shape
 * and `src/index.ts` converts each definition to the V2 shape at registration
 * time.
 */
import { z } from "zod"

/**
 * Tool execution context passed to tool `execute` functions.
 * Mirrors the V1 `ToolContext` fields the tools actually use; `src/index.ts`
 * populates it from the V2 tool context.
 */
export type ToolContext = {
  /** Current project directory for this session. */
  directory: string
  /** Project worktree root for this session. */
  worktree: string
  /** Aborts when the session stops. */
  abort: AbortSignal
  /** Session, message, and agent identifiers (V2 provides all of these). */
  sessionID: string
  messageID: string
  agent: string
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): void
  /** Stub: silently auto-approves every permission prompt; no FlowDeck tool currently calls it. */
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: { [key: string]: any }
  }): Promise<void>
}

export type ToolResult =
  | string
  | {
      title?: string
      output: string
      metadata?: { [key: string]: any }
      attachments?: Array<{ type: "file"; mime: string; url: string; filename?: string }>
    }

export function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>
}): {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>
} {
  return input
}

export namespace tool {
  export const schema = z
}

export type ToolDefinition = ReturnType<typeof tool>