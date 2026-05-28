/**
 * Artifact Store
 *
 * Content-addressed storage for pipeline step outputs.
 * Carry-forward uses short summaries (max 500 chars); full content retrieved
 * lazily on explicit reference. This replaces large carry-forward blobs with
 * compact `artifact:<id>` tokens + short summaries.
 *
 * Key = SHA-256 of output content (content-addressed, not provenance-keyed).
 * Staleness: artifacts are only returned when stateVersion and indexVersion
 * match the values at storage time, preventing stale reuse after codebase changes.
 *
 * Best-effort: storage failures are swallowed so pipelines don't break.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"
import { codebaseDir } from "../tools/planning-state-lib"

const ARTIFACT_DIR_NAME = "artifacts"
export const ARTIFACT_SUMMARY_MAX_CHARS = 500

export interface Artifact {
  id: string
  agent: string
  stage: string
  summary: string
  content: string
  content_chars: number
  state_version: number
  index_version: number
  created_at: string
}

export interface ArtifactRef {
  id: string
  summary: string
}

function artifactDir(dir: string): string {
  return join(codebaseDir(dir), ARTIFACT_DIR_NAME)
}

function artifactPath(dir: string, id: string): string {
  return join(artifactDir(dir), `${id}.json`)
}

/** Content-hash of the output text (24-char hex prefix). */
export function contentHash(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex").slice(0, 24)
}

/** Auto-generate a short summary from content (first ARTIFACT_SUMMARY_MAX_CHARS chars, stripped). */
export function summarizeContent(content: string): string {
  const stripped = content.replace(/\s+/g, " ").trim()
  if (stripped.length <= ARTIFACT_SUMMARY_MAX_CHARS) return stripped
  return stripped.slice(0, ARTIFACT_SUMMARY_MAX_CHARS - 3) + "..."
}

/**
 * Store an artifact and return a ref (id + summary) for carry-forward.
 * On storage failure, returns a ref with the summary only (id may be recomputed later).
 */
export function storeArtifact(
  dir: string,
  agent: string,
  stage: string,
  content: string,
  stateVersion: number,
  indexVersion: number,
): ArtifactRef {
  const id = contentHash(content)
  const summary = summarizeContent(content)
  const artifact: Artifact = {
    id,
    agent,
    stage,
    summary,
    content,
    content_chars: content.length,
    state_version: stateVersion,
    index_version: indexVersion,
    created_at: new Date().toISOString(),
  }
  try {
    const ad = artifactDir(dir)
    if (!existsSync(ad)) mkdirSync(ad, { recursive: true })
    writeFileSync(artifactPath(dir, id), JSON.stringify(artifact, null, 2), "utf-8")
  } catch {
    // Best-effort: don't break pipeline on storage failure
  }
  return { id, summary }
}

/**
 * Retrieve an artifact by ID, enforcing version consistency.
 * Returns null when: not found, stateVersion/indexVersion mismatch, or corrupt file.
 */
export function getArtifact(
  dir: string,
  id: string,
  stateVersion: number,
  indexVersion: number,
): Artifact | null {
  const p = artifactPath(dir, id)
  if (!existsSync(p)) return null
  try {
    const artifact = JSON.parse(readFileSync(p, "utf-8")) as Artifact
    if (artifact.state_version !== stateVersion || artifact.index_version !== indexVersion) return null
    return artifact
  } catch {
    return null
  }
}

/**
 * Resolve `artifact:<id>` tokens in a text string, replacing each with the
 * artifact's full content. Tokens whose artifact is not found or stale are
 * replaced with a `[artifact:<id> not found]` placeholder.
 */
export function resolveArtifactRefs(
  dir: string,
  text: string,
  stateVersion: number,
  indexVersion: number,
): string {
  return text.replace(/artifact:([a-f0-9]{24})/g, (_match, id) => {
    const artifact = getArtifact(dir, id, stateVersion, indexVersion)
    return artifact ? artifact.content : `[artifact:${id} not found]`
  })
}

/** Format an ArtifactRef for carry-forward in pipeline prompts. */
export function formatArtifactRef(ref: ArtifactRef): string {
  return `artifact:${ref.id}\n(Summary: ${ref.summary})`
}
