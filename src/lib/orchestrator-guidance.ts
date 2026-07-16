/**
 * Orchestrator guidance helpers.
 *
 * Centralizes pipeline stage names, intent-to-guidance translation, and
 * topic extraction for the chat.message and command.execute.before hooks.
 * Keeps the routing logic in one place rather than scattered across hooks.
 */

import type { IntentClass } from "../types/state"

/** Pipeline stages driven by the orchestrator. */
export const PIPELINE_STAGES = [
  "explore",
  "research",
  "architect",
  "design",
  "plan",
  "execute",
  "qa",
  "ship",
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

const VERB_PREFIX = /^(add|build|implement|create|fix|update|remove|refactor|introduce)\s+/i

/**
 * Build a guidance message for a detected intent.
 * Returns the text the chat.message hook injects when a user types something
 * that looks like a task but doesn't use the /fd-task command.
 */
export function buildGuidanceMessage(intent: IntentClass, message: string): string {
  const topic = extractTopic(message)
  const quoted = topic ? `"${topic}"` : "your task description"
  switch (intent) {
    case "bugfix":
    case "ui-heavy":
    case "explore":
    case "docs-only":
      return `This looks like a task. Use \`/fd-task ${quoted}\` to start the FlowDeck pipeline.`
    case "trivial":
      return "For a status check, type: status"
    case "unknown":
    default:
      return `To start a FlowDeck task, use: \`/fd-task "${topic || "your task description"}"\``
  }
}

/**
 * Strip the leading imperative verb from a user message.
 * "add user auth" → "user auth"
 * "build dashboard" → "dashboard"
 * "hello world" → "hello world" (no verb)
 */
export function extractTopic(message: string): string {
  return message.replace(VERB_PREFIX, "").trim()
}

/**
 * Extract the first TextPart from a UserMessage.content Part[].
 * Returns empty string if no TextPart is present.
 */
export function extractFirstText(content: unknown): string {
  if (!Array.isArray(content)) return ""
  const textPart = content.find((p: any) => p?.type === "text")
  return typeof textPart?.text === "string" ? textPart.text : ""
}

/**
 * Build a TextPart-shaped object with synthetic: true.
 * Internal helper for hooks to keep the part shape consistent.
 */
export function makeSyntheticTextPart(text: string): {
  type: "text"
  id: string
  sessionID: string
  messageID: string
  text: string
  synthetic: true
} {
  return {
    type: "text",
    id: crypto.randomUUID(),
    sessionID: "",
    messageID: "",
    text,
    synthetic: true,
  }
}

const CONFIDENCE_THRESHOLD = 0.4
const DEFAULT_GUIDANCE =
  'To start a FlowDeck task, use: `/fd-task "your task description"`'

/**
 * Apply the chat.message hook logic to a message.
 * Returns an array of synthetic TextParts to inject, or empty if nothing to inject.
 *
 * @param message — the UserMessage from chat.message hook output
 * @param detectFn — async function returning { intent, confidence } — injectable for tests
 */
export async function applyChatMessageGuidance(
  message: { role?: string; content?: unknown },
  detectFn: (text: string) => Promise<{ intent: IntentClass; confidence: number }>
): Promise<Array<{ type: "text"; id: string; sessionID: string; messageID: string; text: string; synthetic: true }>> {
  if (message?.role !== "user") return []
  const text = extractFirstText(message?.content)
  if (!text.trim() || text.startsWith("/")) return []

  let result
  try {
    result = await detectFn(text)
  } catch {
    return [makeSyntheticTextPart(DEFAULT_GUIDANCE)]
  }

  if (result.confidence < CONFIDENCE_THRESHOLD) return []
  return [makeSyntheticTextPart(buildGuidanceMessage(result.intent, text))]
}
