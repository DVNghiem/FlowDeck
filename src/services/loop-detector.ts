import { resolve } from "path"

export type LoopResult =
  | { action: "allow" }
  | { action: "block"; reason: string; escalationMessage: string }
  | { action: "warn"; message: string }

export interface LoopDetectorConfig {
  enabled: boolean
  maxRepeats: number
  similarityThreshold: number
  historySize: number
}

export interface ActionRecord {
  toolName: string
  normalizedKey: string
  args: Record<string, unknown>
  outputHash: string
  outputPreview: string
  status: "success" | "error" | "blocked"
  timestamp: number
  callCount: number
  consecutiveSameResultCount: number
}

const NON_MUTATING_TOOLS = new Set([
  "read",
  "view",
  "bash",
  "shell",
  "grep",
  "glob",
  "search",
])

const TRANSIENT_ERROR_KEYWORDS = [
  "timeout",
  "econnrefused",
  "econnreset",
  "etimedout",
  "locked",
  "busy",
  "temporarily unavailable",
]

const DEFAULT_CONFIG: LoopDetectorConfig = {
  enabled: true,
  maxRepeats: 2,
  similarityThreshold: 0.9,
  historySize: 20,
}

function djb2Hash(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

function hashOutput(output: unknown): string {
  if (typeof output === "string") {
    const truncated = output.length > 10_240 ? output.slice(0, 10_240) : output
    return djb2Hash(truncated)
  }
  let serialized: string
  try {
    serialized = JSON.stringify(output)
  } catch {
    serialized = String(output)
  }
  const truncated = serialized.length > 10_240 ? serialized.slice(0, 10_240) : serialized
  return djb2Hash(truncated)
}

function lineSimilarity(a: string, b: string): number {
  const linesA = new Set(a.split("\n"))
  const linesB = new Set(b.split("\n"))
  const intersection = new Set([...linesA].filter((x) => linesB.has(x)))
  const union = new Set([...linesA, ...linesB])
  return union.size === 0 ? 1 : intersection.size / union.size
}

function getOutputPreview(output: unknown): string {
  if (output === null || output === undefined) return ""
  if (typeof output === "string") return output.slice(0, 200)
  try {
    return JSON.stringify(output).slice(0, 200)
  } catch {
    return String(output).slice(0, 200)
  }
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj)
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`
  }
  const record = obj as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
  return `{${pairs.join(",")}}`
}

function resolveEnvVars(command: string): string {
  return command
    .replace(/\$RTK_BIN\b/gi, "rtk")
    .replace(/\$HOME\b/gi, "~")
    .replace(/\$USER\b/gi, "user")
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim()
}

export function normalizeAction(toolName: string, args: Record<string, unknown>): string {
  const tool = toolName.toLowerCase()

  if (tool === "bash" || tool === "shell") {
    const command = typeof args.command === "string" ? args.command : ""
    const normalized = collapseWhitespace(resolveEnvVars(command)).toLowerCase()
    return `shell:${normalized}`
  }

  if (tool === "read" || tool === "view") {
    const filePath = typeof args.filePath === "string" ? args.filePath : ""
    try {
      return `${tool}:${resolve(filePath || "")}`
    } catch {
      return `${tool}:${filePath}`
    }
  }

  if (tool === "write" || tool === "edit") {
    const filePath = typeof args.filePath === "string" ? args.filePath : ""
    try {
      return `${tool}:${resolve(filePath || "")}`
    } catch {
      return `${tool}:${filePath}`
    }
  }

  if (tool === "grep" || tool === "glob" || tool === "search") {
    const pattern = typeof args.pattern === "string" ? args.pattern : ""
    const path = typeof args.path === "string" ? args.path : ""
    return `${tool}:${pattern}:${resolve(path || ".")}`
  }

  const sorted = stableStringify(args)
  return `${tool}:${sorted}`
}

type Observation = "same_result" | "no_progress" | "new_information" | "transient_failure"

function classifyObservation(
  toolName: string,
  previous: ActionRecord | undefined,
  output: unknown,
  status: "success" | "error" | "blocked",
  similarityThreshold: number
): { observation: Observation; outputHash: string; outputPreview: string } {
  const outputPreview = getOutputPreview(output)
  const tool = toolName.toLowerCase()

  if (status === "blocked") {
    return { observation: "same_result", outputHash: hashOutput(output), outputPreview }
  }

  if (status === "error") {
    const errorMessage =
      output && typeof output === "object" && "error" in output
        ? String(output.error)
        : typeof output === "string"
        ? output
        : ""
    const lower = errorMessage.toLowerCase()
    const isTransient = TRANSIENT_ERROR_KEYWORDS.some((k) => lower.includes(k))
    return {
      observation: isTransient ? "transient_failure" : "same_result",
      outputHash: djb2Hash(errorMessage),
      outputPreview: errorMessage.slice(0, 200),
    }
  }

  // success
  if (tool === "write" || tool === "edit") {
    const contentHash = hashOutput(output)
    return { observation: "new_information", outputHash: contentHash, outputPreview }
  }

  const outputHash = hashOutput(output)

  if (!previous) {
    return { observation: "new_information", outputHash, outputPreview }
  }

  if (outputHash === previous.outputHash) {
    return { observation: "same_result", outputHash, outputPreview }
  }

  if (NON_MUTATING_TOOLS.has(tool)) {
    const similarity = lineSimilarity(outputPreview, previous.outputPreview)
    if (similarity >= similarityThreshold) {
      return { observation: "no_progress", outputHash, outputPreview }
    }
  }

  return { observation: "new_information", outputHash, outputPreview }
}

function formatNormalizedPreview(toolName: string, normalizedKey: string): string {
  const prefix = `${toolName.toLowerCase()}:"`
  const idx = normalizedKey.indexOf(":")
  const body = idx >= 0 ? normalizedKey.slice(idx + 1) : normalizedKey
  return `${prefix}${body}"`
}

function redactForDisplay(toolName: string, normalizedKey: string): string {
  const tool = toolName.toLowerCase()
  if (tool === "bash" || tool === "shell") {
    const idx = normalizedKey.indexOf(":")
    const cmd = idx >= 0 ? normalizedKey.slice(idx + 1) : normalizedKey
    const preview = cmd.slice(0, 30)
    const hash = djb2Hash(cmd)
    return `${tool}:"${preview}" (hash: ${hash})`
  }
  // For other tools, show tool name + file path only, not full serialized args
  const idx = normalizedKey.indexOf(":")
  if (idx >= 0) {
    const body = normalizedKey.slice(idx + 1)
    // If body looks like a path, show it; otherwise hash it
    if (body.startsWith("/") || body.startsWith(".") || body.includes("/")) {
      return `${tool}:"${body}"`
    }
    const preview = body.slice(0, 30)
    const hash = djb2Hash(body)
    return `${tool}:"${preview}" (hash: ${hash})`
  }
  return `${tool}:"${normalizedKey}"`
}

export class LoopDetector {
  private config: LoopDetectorConfig
  private appLog?: (msg: string) => void
  private history: Map<string, Map<string, ActionRecord>> = new Map()
  private persistenceHealthy = true
  private persistenceWarningLogged = new Set<string>()

  constructor(config?: Partial<LoopDetectorConfig>, appLog?: (msg: string) => void) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.appLog = appLog
  }

  setPersistenceHealthy(healthy: boolean): void {
    if (this.persistenceHealthy === healthy) return
    this.persistenceHealthy = healthy
    if (!healthy && this.appLog) {
      this.appLog(
        "[loop-guard] Event log persistence failed — loop detection running in-memory only. History will be lost on restart."
      )
    }
  }

  getHistory(sessionId: string): ActionRecord[] {
    const sessionHistory = this.history.get(sessionId)
    if (!sessionHistory) return []
    return Array.from(sessionHistory.values()).sort((a, b) => a.timestamp - b.timestamp)
  }

  clearSession(sessionId: string): void {
    this.history.delete(sessionId)
  }

  checkBefore(toolName: string, args: Record<string, unknown>, sessionId: string): LoopResult {
    if (!this.config.enabled) {
      return { action: "allow" }
    }

    if (!this.persistenceHealthy && !this.persistenceWarningLogged.has(sessionId)) {
      if (this.persistenceWarningLogged.size >= 1000) {
        this.persistenceWarningLogged.clear()
      }
      this.persistenceWarningLogged.add(sessionId)
      if (this.appLog) {
        this.appLog(
          "[loop-guard] Event log persistence failed — loop detection running in-memory only. History will be lost on restart."
        )
      }
    }

    const normalizedKey = normalizeAction(toolName, args)
    const record = this.getSessionRecord(sessionId, normalizedKey)

    if (!record) {
      return { action: "allow" }
    }

    const maxRepeats = this.config.maxRepeats

    if (record.consecutiveSameResultCount >= maxRepeats) {
      const reason = "same_result"
      const escalationMessage = this.buildEscalationMessage(
        toolName,
        normalizedKey,
        record.status,
        record.consecutiveSameResultCount,
        reason
      )
      if (this.appLog) {
        this.appLog(
          `[loop-guard] blocked repeat of "${redactForDisplay(toolName, normalizedKey)}" — already executed ${record.consecutiveSameResultCount} times with same result`
        )
      }
      return { action: "block", reason, escalationMessage }
    }

    // no_progress is only set transiently before being blocked on next call,
    // but guard here in case checkBefore is invoked after recordAfter marked it.
    if (record.callCount >= 2 && this.isNoProgressMarker(record)) {
      const reason = "no_progress"
      const escalationMessage = this.buildEscalationMessage(
        toolName,
        normalizedKey,
        record.status,
        record.callCount,
        reason
      )
      if (this.appLog) {
        this.appLog(
          `[loop-guard] blocked repeat of "${redactForDisplay(toolName, normalizedKey)}" — already executed ${record.callCount} times with no progress`
        )
      }
      return { action: "block", reason, escalationMessage }
    }

    return { action: "allow" }
  }

  recordAfter(
    toolName: string,
    args: Record<string, unknown>,
    output: unknown,
    sessionId: string,
    status: "success" | "error" | "blocked" = "success"
  ): void {
    if (!this.config.enabled) return

    const normalizedKey = normalizeAction(toolName, args)
    const previous = this.getSessionRecord(sessionId, normalizedKey)

    const { observation, outputHash, outputPreview } = classifyObservation(
      toolName,
      previous,
      output,
      status,
      this.config.similarityThreshold
    )

    let record: ActionRecord
    if (!previous) {
      record = {
        toolName,
        normalizedKey,
        args,
        outputHash,
        outputPreview,
        status,
        timestamp: Date.now(),
        callCount: 1,
        consecutiveSameResultCount:
          observation === "transient_failure" ? 1 : 0,
      }
    } else {
      let nextConsecutive = previous.consecutiveSameResultCount
      if (
        observation === "same_result" ||
        observation === "transient_failure" ||
        observation === "no_progress"
      ) {
        nextConsecutive = previous.consecutiveSameResultCount + 1
      } else {
        nextConsecutive = 0
      }

      record = {
        toolName,
        normalizedKey,
        args,
        outputHash,
        outputPreview,
        status,
        timestamp: Date.now(),
        callCount: previous.callCount + 1,
        consecutiveSameResultCount: nextConsecutive,
      }
    }

    if (observation === "transient_failure" && this.appLog) {
      const transientCount = record.consecutiveSameResultCount
      if (transientCount <= 3) {
        this.appLog(
          `[loop-guard] transient failure detected for "${toolName}" — allowing retry ${transientCount}/3`
        )
      }
    }

    this.setSessionRecord(sessionId, normalizedKey, record)
  }

  private getSessionRecord(sessionId: string, normalizedKey: string): ActionRecord | undefined {
    return this.history.get(sessionId)?.get(normalizedKey)
  }

  private setSessionRecord(
    sessionId: string,
    normalizedKey: string,
    record: ActionRecord
  ): void {
    let sessionHistory = this.history.get(sessionId)
    if (!sessionHistory) {
      sessionHistory = new Map()
      this.history.set(sessionId, sessionHistory)
    }

    sessionHistory.set(normalizedKey, record)

    if (sessionHistory.size > this.config.historySize) {
      this.evictOldest(sessionHistory)
    }
  }

  private evictOldest(sessionHistory: Map<string, ActionRecord>): void {
    let oldestKey: string | undefined
    let oldestTime = Infinity
    for (const [key, value] of sessionHistory.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp
        oldestKey = key
      }
    }
    if (oldestKey !== undefined) {
      sessionHistory.delete(oldestKey)
    }
  }

  private isNoProgressMarker(record: ActionRecord): boolean {
    // Heuristic: call count >=2 with same output hash as some previous implies no progress.
    // We rely on consecutiveSameResultCount already being incremented for no_progress.
    return record.consecutiveSameResultCount >= 1 && record.callCount >= 2
  }

  private buildEscalationMessage(
    toolName: string,
    normalizedKey: string,
    status: "success" | "error" | "blocked",
    count: number,
    _reason: string
  ): string {
    const normalizedPreview = redactForDisplay(toolName, normalizedKey)
    return `[FlowDeck Loop Guard] You already ran \`${normalizedPreview}\` and got the same result (status: ${status}, repeats: ${count}). Do NOT repeat it. Choose a different approach, inspect the tool behavior, or ask the human for guidance.`
  }
}
