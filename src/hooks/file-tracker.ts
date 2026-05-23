/**
 * File Watcher + File Edited Hooks
 * Tracks files modified during a session.
 * Used by the compaction hook to include recently edited files in context.
 *
 * Ported/adapted from ECC's file.watcher.updated and file.edited handlers.
 */

import { appendChangedFiles } from "../tools/codebase-index"

export type ChangeType = "added" | "modified" | "deleted"

export interface FileChange {
  path: string
  type: ChangeType
}

export class SessionFileTracker {
  private changes = new Map<string, FileChange>()
  private onFileChange?: (path: string, type: ChangeType) => void

  setOnFileChange(callback: (path: string, type: ChangeType) => void): void {
    this.onFileChange = callback
  }

  record(path: string, type: ChangeType): void {
    this.changes.set(path, { path, type })
    if (this.onFileChange) {
      this.onFileChange(path, type)
    }
  }

  getChanges(): FileChange[] {
    return [...this.changes.values()]
  }

  getEditedPaths(): string[] {
    return [...this.changes.values()]
      .filter((c) => c.type !== "deleted")
      .map((c) => c.path)
  }

  clear(): void {
    this.changes.clear()
  }
}

// Singleton tracker — shared across hooks within a plugin instance
export function createFileTrackerHooks(tracker: SessionFileTracker) {
  const fileEdited = (event: { path: string }) => {
    tracker.record(event.path, "modified")
  }

  const fileWatcherUpdated = (event: { path: string; type: string }) => {
    let changeType: ChangeType = "modified"
    if (event.type === "create" || event.type === "add") changeType = "added"
    else if (event.type === "delete" || event.type === "remove") changeType = "deleted"
    tracker.record(event.path, changeType)
  }

  return { fileEdited, fileWatcherUpdated }
}

export function createCodebaseIndexFileTracker(directory: string): {
  tracker: SessionFileTracker
  publishToIndex: (agent: string, stage: string) => void
} {
  const tracker = new SessionFileTracker()
  const changedFiles: string[] = []

  tracker.setOnFileChange((path, type) => {
    if (type !== "deleted") {
      changedFiles.push(path)
    }
  })

  const publishToIndex = (agent: string, stage: string) => {
    if (changedFiles.length > 0) {
      appendChangedFiles(directory, agent, stage, [...changedFiles])
      changedFiles.length = 0 // reset
    }
  }

  return { tracker, publishToIndex }
}
