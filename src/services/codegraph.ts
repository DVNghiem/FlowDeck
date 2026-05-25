import { spawnSync } from "child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"

const CODEGRAPH_META_FILE = "CODEGRAPH.md"
const MAX_FRESHNESS_MS = 30 * 60 * 1000 // 30 minutes

export interface CodegraphMeta {
  installed: boolean
  indexed: boolean
  lastIndexedAt: string
  lastIndexedRevision: string
  lastIndexedBy: string
  freshnessStatus: "fresh" | "stale" | "unknown"
  installLog: string
  indexLog: string
}

function metaPath(dir: string): string {
  return join(codebaseDir(dir), CODEGRAPH_META_FILE)
}

export function isCodegraphInstalled(): boolean {
  try {
    const result = spawnSync("codegraph", ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function isCodegraphIndexed(dir: string): boolean {
  return existsSync(join(dir, ".codegraph", "codegraph.db"))
}

export function readCodegraphMeta(dir: string): CodegraphMeta {
  const path = metaPath(dir)
  if (!existsSync(path)) {
    return {
      installed: false,
      indexed: false,
      lastIndexedAt: "",
      lastIndexedRevision: "",
      lastIndexedBy: "",
      freshnessStatus: "unknown",
      installLog: "",
      indexLog: "",
    }
  }
  try {
    const content = readFileSync(path, "utf-8")
    return parseCodegraphMeta(content)
  } catch {
    return {
      installed: false,
      indexed: false,
      lastIndexedAt: "",
      lastIndexedRevision: "",
      lastIndexedBy: "",
      freshnessStatus: "unknown",
      installLog: "",
      indexLog: "",
    }
  }
}

function parseCodegraphMeta(content: string): CodegraphMeta {
  const result: Partial<CodegraphMeta> = {}
  for (const line of content.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue
    const stripped = line.replace(/\*\*/g, "")
    const m = stripped.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/)
    if (!m) continue
    const key = m[1]
    const value = m[2].trim().replace(/^["']|["']$/g, "")
    switch (key) {
      case "installed":
        result.installed = value === "true"
        break
      case "indexed":
        result.indexed = value === "true"
        break
      case "freshnessStatus":
        result.freshnessStatus = value as CodegraphMeta["freshnessStatus"]
        break
      case "lastIndexedAt":
        result.lastIndexedAt = value
        break
      case "lastIndexedRevision":
        result.lastIndexedRevision = value
        break
      case "lastIndexedBy":
        result.lastIndexedBy = value
        break
      case "installLog":
        result.installLog = value
        break
      case "indexLog":
        result.indexLog = value
        break
    }
  }
  return {
    installed: result.installed ?? false,
    indexed: result.indexed ?? false,
    lastIndexedAt: result.lastIndexedAt ?? "",
    lastIndexedRevision: result.lastIndexedRevision ?? "",
    lastIndexedBy: result.lastIndexedBy ?? "",
    freshnessStatus: result.freshnessStatus ?? "unknown",
    installLog: result.installLog ?? "",
    indexLog: result.indexLog ?? "",
  }
}

export function writeCodegraphMeta(dir: string, meta: CodegraphMeta): void {
  const base = codebaseDir(dir)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  const lines = [
    "# Codegraph Metadata",
    "",
    `**installed:** ${meta.installed}`,
    `**indexed:** ${meta.indexed}`,
    `**lastIndexedAt:** ${meta.lastIndexedAt}`,
    `**lastIndexedRevision:** ${meta.lastIndexedRevision}`,
    `**lastIndexedBy:** ${meta.lastIndexedBy}`,
    `**freshnessStatus:** ${meta.freshnessStatus}`,
    `**installLog:** ${meta.installLog}`,
    `**indexLog:** ${meta.indexLog}`,
  ]
  writeFileSync(metaPath(dir), lines.join("\n"), "utf-8")
}

export function isCodegraphFresh(dir: string, maxAgeMs = MAX_FRESHNESS_MS): boolean {
  const meta = readCodegraphMeta(dir)
  if (!meta.indexed) return false
  if (meta.freshnessStatus === "stale") return false
  if (!meta.lastIndexedAt) return false
  const age = Date.now() - new Date(meta.lastIndexedAt).getTime()
  return age < maxAgeMs
}

export function getCurrentRevision(dir: string): string {
  try {
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    })
    return result.status === 0 ? (result.stdout ?? "").trim() : ""
  } catch {
    return ""
  }
}

export function getChangedFilesSince(dir: string, revision: string): string[] {
  if (!revision) return []
  try {
    const result = spawnSync("git", ["diff", "--name-only", revision, "HEAD"], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    })
    if (result.status !== 0) return []
    return (result.stdout ?? "").trim().split("\n").filter(Boolean)
  } catch {
    return []
  }
}

export function hasChangedSinceLastIndex(dir: string): boolean {
  const meta = readCodegraphMeta(dir)
  if (!meta.indexed || !meta.lastIndexedRevision) return true
  const changed = getChangedFilesSince(dir, meta.lastIndexedRevision)
  return changed.length > 0
}

export interface InstallResult {
  success: boolean
  alreadyInstalled: boolean
  log: string
  error?: string
}

export function installCodegraph(): InstallResult {
  if (isCodegraphInstalled()) {
    return {
      success: true,
      alreadyInstalled: true,
      log: "[codegraph] Already installed — skipping install",
    }
  }
  try {
    const result = spawnSync("npm", ["install", "-g", "@colbymchenry/codegraph"], {
      encoding: "utf-8",
      timeout: 120_000,
      stdio: "pipe",
    })
    if (result.status === 0) {
      return {
        success: true,
        alreadyInstalled: false,
        log: `[codegraph] Install succeeded: ${(result.stdout ?? "").trim()}`,
      }
    }
    return {
      success: false,
      alreadyInstalled: false,
      log: (result.stdout ?? "").trim(),
      error: (result.stderr ?? "").trim() || `npm exited with code ${result.status}`,
    }
  } catch (err) {
    return {
      success: false,
      alreadyInstalled: false,
      log: "",
      error: String(err),
    }
  }
}

export interface IndexResult {
  success: boolean
  full: boolean
  log: string
  changedFiles: string[]
  error?: string
}

export function initCodegraphIndex(dir: string, agent: string): IndexResult {
  const installResult = installCodegraph()
  if (!installResult.success) {
    return {
      success: false,
      full: false,
      log: installResult.log,
      changedFiles: [],
      error: `codegraph install failed: ${installResult.error}`,
    }
  }

  const meta = readCodegraphMeta(dir)
  const alreadyIndexed = isCodegraphIndexed(dir)
  const revision = getCurrentRevision(dir)
  const changedFiles = alreadyIndexed && meta.lastIndexedRevision
    ? getChangedFilesSince(dir, meta.lastIndexedRevision)
    : []
  const needsFullRebuild = !alreadyIndexed || !meta.indexed

  // Command selection:
  // - Not yet initialized: `codegraph init --index` (init project + build index)
  // - Already indexed, force full rebuild: `codegraph index --force`
  // - (incremental path is handled by refreshCodegraphIndex via `codegraph sync`)
  const cmd = needsFullRebuild && !alreadyIndexed
    ? ["init", "--index"]
    : ["index", "--force"]

  try {
    const result = spawnSync("codegraph", cmd, {
      cwd: dir,
      encoding: "utf-8",
      timeout: 300_000,
      stdio: "pipe",
    })
    const success = result.status === 0

    const log = [
      `[codegraph] Full index ${success ? "succeeded" : "failed"} (cmd: codegraph ${cmd.join(" ")})`,
      `[codegraph] Install: ${installResult.alreadyInstalled ? "skipped (already installed)" : "ran successfully"}`,
      `[codegraph] Revision: ${revision || "(no git)"}`,
      `[codegraph] Changed files since last index: ${changedFiles.length}`,
      success ? (result.stdout ?? "").trim() : (result.stderr ?? "").trim(),
    ].filter(Boolean).join("\n")

    const now = new Date().toISOString()
    writeCodegraphMeta(dir, {
      installed: true,
      indexed: success,
      lastIndexedAt: success ? now : meta.lastIndexedAt,
      lastIndexedRevision: success ? revision : meta.lastIndexedRevision,
      lastIndexedBy: agent,
      freshnessStatus: success ? "fresh" : "stale",
      installLog: installResult.log,
      indexLog: log,
    })

    return { success, full: true, log, changedFiles, error: success ? undefined : (result.stderr ?? "").trim() }
  } catch (err) {
    const errMsg = String(err)
    writeCodegraphMeta(dir, {
      installed: isCodegraphInstalled(),
      indexed: false,
      lastIndexedAt: "",
      lastIndexedRevision: "",
      lastIndexedBy: agent,
      freshnessStatus: "stale",
      installLog: installResult.log,
      indexLog: `[codegraph] Index failed: ${errMsg}`,
    })
    return {
      success: false,
      full: true,
      log: `[codegraph] Index failed: ${errMsg}`,
      changedFiles,
      error: errMsg,
    }
  }
}

export function refreshCodegraphIndex(dir: string, agent: string): IndexResult {
  // Use `codegraph sync` for incremental updates after code changes.
  // Falls back to a full `codegraph index --force` if sync fails or index is missing.
  const installResult = installCodegraph()
  if (!installResult.success) {
    return {
      success: false,
      full: false,
      log: installResult.log,
      changedFiles: [],
      error: `codegraph install failed: ${installResult.error}`,
    }
  }

  if (!isCodegraphIndexed(dir)) {
    // No index yet — fall back to full init+index
    return initCodegraphIndex(dir, agent)
  }

  const meta = readCodegraphMeta(dir)
  const revision = getCurrentRevision(dir)
  const changedFiles = meta.lastIndexedRevision
    ? getChangedFilesSince(dir, meta.lastIndexedRevision)
    : []

  try {
    const result = spawnSync("codegraph", ["sync"], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: "pipe",
    })
    const success = result.status === 0

    const log = [
      `[codegraph] Incremental sync ${success ? "succeeded" : "failed"}`,
      `[codegraph] Revision: ${revision || "(no git)"}`,
      `[codegraph] Changed files: ${changedFiles.length}`,
      success ? (result.stdout ?? "").trim() : (result.stderr ?? "").trim(),
    ].filter(Boolean).join("\n")

    if (!success) {
      // Sync failed — fall back to full rebuild
      return initCodegraphIndex(dir, agent)
    }

    const now = new Date().toISOString()
    writeCodegraphMeta(dir, {
      installed: true,
      indexed: true,
      lastIndexedAt: now,
      lastIndexedRevision: revision,
      lastIndexedBy: agent,
      freshnessStatus: "fresh",
      installLog: installResult.log,
      indexLog: log,
    })

    return { success: true, full: false, log, changedFiles }
  } catch (err) {
    // Exception during sync — fall back to full rebuild
    return initCodegraphIndex(dir, agent)
  }
}

export function markCodegraphStale(dir: string): void {
  const meta = readCodegraphMeta(dir)
  writeCodegraphMeta(dir, { ...meta, freshnessStatus: "stale" })
}
