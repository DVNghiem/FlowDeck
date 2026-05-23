import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { planningDir } from "./planning-state-lib"

const CODEBASE_INDEX_FILE = "CODEBASE_INDEX.md"

export interface FileSnapshot {
  lastModifiedAt: string
  lastModifiedBy: string
  changeType: "added" | "modified" | "deleted"
  sourceStage: string
}

export interface ExplorationEntry {
  stage: string
  timestamp: string
  filesExplored: string[]
  reason: string
}

export interface CodebaseIndex {
  exists: boolean
  lastUpdatedAt: string
  lastUpdatedBy: string
  sourceStage: string
  changedFiles: string[]
  fileSnapshots: Record<string, FileSnapshot>
  explorationHistory: ExplorationEntry[]
  summaryVersion: number
  freshnessStatus: "fresh" | "stale" | "unknown"
}

function indexPath(dir: string): string {
  return join(planningDir(dir), CODEBASE_INDEX_FILE)
}

export function readCodebaseIndex(dir: string): CodebaseIndex {
  const path = indexPath(dir)
  if (!existsSync(path)) {
    return {
      exists: false,
      lastUpdatedAt: "",
      lastUpdatedBy: "",
      sourceStage: "",
      changedFiles: [],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 0,
      freshnessStatus: "unknown",
    }
  }
  try {
    const content = readFileSync(path, "utf-8")
    return parseCodebaseIndexContent(content)
  } catch {
    return {
      exists: false,
      lastUpdatedAt: "",
      lastUpdatedBy: "",
      sourceStage: "",
      changedFiles: [],
      fileSnapshots: {},
      explorationHistory: [],
      summaryVersion: 0,
      freshnessStatus: "unknown",
    }
  }
}

function parseCodebaseIndexContent(content: string): CodebaseIndex {
  const result: Partial<CodebaseIndex> = { exists: true }

  for (const line of content.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue
    // Strip markdown bold markers: **key:** value -> key: value
    const strippedLine = line.replace(/\*\*/g, "").replace(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/, "$1: $2")
    const kvMatch = strippedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/)
    if (!kvMatch) continue
    const key = kvMatch[1].trim()
    const value = kvMatch[2].trim()
    if (key === "changedFiles") {
      result.changedFiles = value.replace(/[\[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean)
    } else if (key === "summaryVersion") {
      result.summaryVersion = parseInt(value, 10) || 0
    } else if (key === "freshnessStatus") {
      result.freshnessStatus = value as CodebaseIndex["freshnessStatus"]
    } else if (key === "lastUpdatedAt" || key === "lastUpdatedBy" || key === "sourceStage") {
      ;(result as Record<string, unknown>)[key] = value.replace(/^["']|["']$/g, "")
    }
  }

  // Try to parse JSON sections (multiple blocks possible)
  // The JSON blocks contain either:
  // - An object with fileSnapshots/explorationHistory properties (when both present)
  // - A bare object (fileSnapshots) or array (explorationHistory) when written individually
  let blockCount = 0
  for (const jsonMatch of content.matchAll(/```json\n([\s\S]*?)\n```/g)) {
    if (blockCount >= 2) break
    blockCount++
    try {
      const parsed = JSON.parse(jsonMatch[1])
      // Check if it's an object with properties first
      if (parsed.fileSnapshots) result.fileSnapshots = parsed.fileSnapshots
      if (parsed.explorationHistory) result.explorationHistory = parsed.explorationHistory
      // Otherwise check if it's a bare object (fileSnapshots) or array (explorationHistory)
      if (!parsed.fileSnapshots && !parsed.explorationHistory) {
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          // Could be a bare fileSnapshots object
          if (!result.fileSnapshots) result.fileSnapshots = {}
          Object.assign(result.fileSnapshots, parsed)
        } else if (Array.isArray(parsed)) {
          // Could be a bare explorationHistory array
          result.explorationHistory = parsed
        }
      }
    } catch {
      result.freshnessStatus = "unknown"
    }
  }

  return {
    exists: true,
    lastUpdatedAt: result.lastUpdatedAt || "",
    lastUpdatedBy: result.lastUpdatedBy || "",
    sourceStage: result.sourceStage || "",
    changedFiles: result.changedFiles || [],
    fileSnapshots: result.fileSnapshots || {},
    explorationHistory: result.explorationHistory || [],
    summaryVersion: result.summaryVersion || 0,
    freshnessStatus: result.freshnessStatus || "unknown",
  }
}

export function isCodebaseIndexFresh(dir: string, maxAgeMs = 5 * 60 * 1000): boolean {
  const index = readCodebaseIndex(dir)
  if (!index.exists) return false
  if (index.freshnessStatus === "stale") return false
  if (!index.lastUpdatedAt) return false
  const age = Date.now() - new Date(index.lastUpdatedAt).getTime()
  return age < maxAgeMs
}

function ensurePlanningDir(dir: string): void {
  const pd = planningDir(dir)
  if (!existsSync(pd)) mkdirSync(pd, { recursive: true })
}

export function writeCodebaseIndex(dir: string, index: Omit<CodebaseIndex, "exists">): void {
  ensurePlanningDir(dir)
  const path = indexPath(dir)
  const lines = [
    "# Codebase Index",
    "",
    `**lastUpdatedAt:** ${index.lastUpdatedAt || new Date().toISOString()}`,
    `**lastUpdatedBy:** ${index.lastUpdatedBy}`,
    `**sourceStage:** ${index.sourceStage}`,
    `**summaryVersion:** ${index.summaryVersion}`,
    `**freshnessStatus:** ${index.freshnessStatus}`,
    "",
    `**changedFiles:** [${index.changedFiles.join(", ")}]`,
    "",
    "## File Snapshots",
    "```json",
    JSON.stringify(index.fileSnapshots || {}, null, 2),
    "```",
    "",
    "## Exploration History",
    "```json",
    JSON.stringify(index.explorationHistory || [], null, 2),
    "```",
  ]
  writeFileSync(path, lines.join("\n"), "utf-8")
}

export function appendChangedFiles(
  dir: string,
  agent: string,
  stage: string,
  files: string[],
): void {
  const index = readCodebaseIndex(dir)
  const now = new Date().toISOString()

  // Merge files without duplicates
  const existing = new Set(index.changedFiles)
  for (const f of files) existing.add(f)
  const mergedFiles = Array.from(existing)

  // Update snapshots
  const snapshots = { ...index.fileSnapshots }
  for (const f of files) {
    snapshots[f] = {
      lastModifiedAt: now,
      lastModifiedBy: agent,
      changeType: "modified",
      sourceStage: stage,
    }
  }

  const updated: Omit<CodebaseIndex, "exists"> = {
    lastUpdatedAt: now,
    lastUpdatedBy: agent,
    sourceStage: stage,
    changedFiles: mergedFiles,
    fileSnapshots: snapshots,
    explorationHistory: index.explorationHistory,
    summaryVersion: index.summaryVersion + 1,
    freshnessStatus: "fresh",
  }

  writeCodebaseIndex(dir, updated)
}

export function recordExploration(
  dir: string,
  stage: string,
  filesExplored: string[],
  reason: string,
): void {
  const index = readCodebaseIndex(dir)
  const now = new Date().toISOString()

  const entry: ExplorationEntry = {
    stage,
    timestamp: now,
    filesExplored,
    reason,
  }

  const updated: Omit<CodebaseIndex, "exists"> = {
    lastUpdatedAt: now,
    lastUpdatedBy: stage,
    sourceStage: stage,
    changedFiles: index.changedFiles,
    fileSnapshots: index.fileSnapshots,
    explorationHistory: [...index.explorationHistory, entry],
    summaryVersion: index.summaryVersion + 1,
    freshnessStatus: "fresh",
  }

  writeCodebaseIndex(dir, updated)
}

export function getFileSnapshot(dir: string, filePath: string): FileSnapshot | null {
  const index = readCodebaseIndex(dir)
  return index.fileSnapshots[filePath] || null
}