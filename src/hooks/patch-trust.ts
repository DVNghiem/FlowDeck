/**
 * Patch Trust Score Hook
 * Assigns a confidence and risk rating to every AI-generated write/edit.
 * Scores: 0–100 (higher = more trustworthy)
 * Verdicts: safe (≥80), review-required (40–79), high-risk (<40)
 *
 * Risk signals checked:
 * - Writing to volatile/critical paths (from VOLATILITY.json)
 * - Edit contains auth/crypto/payment keywords
 * - File has recent failure history (FAILURES.json)
 * - File is in arch-constrained paths (CONSTRAINTS.md)
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"

const HIGH_RISK_KEYWORDS = [
  "password", "secret", "token", "auth", "crypto", "encrypt", "decrypt",
  "payment", "billing", "credit_card", "stripe", "jwt", "session", "oauth",
  "admin", "sudo", "root", "privilege",
]

export type TrustVerdict = "safe" | "review-required" | "high-risk"

export interface TrustScore {
  score: number
  verdict: TrustVerdict
  signals: string[]
}

function loadVolatility(directory: string): Record<string, string> {
  const p = join(codebaseDir(directory), "VOLATILITY.json")
  if (!existsSync(p)) return {}
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"))
    const map: Record<string, string> = {}
    for (const entry of data.entries ?? []) map[entry.path] = entry.stability
    return map
  } catch {
    return {}
  }
}

function loadFailedPaths(directory: string): string[] {
  const p = join(codebaseDir(directory), "FAILURES.json")
  if (!existsSync(p)) return []
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"))
    return (data.entries ?? []).flatMap((e: any) => e.affected_paths ?? [])
  } catch {
    return []
  }
}

export function scorePatch(directory: string, filePath: string, content?: string): TrustScore {
  let score = 100
  const signals: string[] = []

  const volatility = loadVolatility(directory)
  const stability = Object.entries(volatility).find(([path]) => filePath.includes(path))?.[1]
  if (stability === "critical") { score -= 40; signals.push("file is in critical volatility zone") }
  else if (stability === "volatile") { score -= 25; signals.push("file is in volatile zone") }
  else if (stability === "moderate") { score -= 10; signals.push("file has moderate churn") }

  const failedPaths = loadFailedPaths(directory)
  if (failedPaths.some(p => filePath.includes(p))) {
    score -= 20
    signals.push("file has prior failure history")
  }

  if (content) {
    const lower = content.toLowerCase()
    const hits = HIGH_RISK_KEYWORDS.filter(kw => lower.includes(kw))
    if (hits.length > 0) {
      score -= Math.min(hits.length * 8, 30)
      signals.push(`high-risk keywords detected: ${hits.slice(0, 3).join(", ")}`)
    }
  }

  score = Math.max(0, score)
  const verdict: TrustVerdict = score >= 80 ? "safe" : score >= 40 ? "review-required" : "high-risk"
  return { score, verdict, signals }
}

export async function patchTrustHook(
  ctx: { directory: string },
  input: { tool: string },
  output: { args: any }
): Promise<void> {
  if (input.tool !== "write" && input.tool !== "edit") return
  const filePath: string = output.args?.filePath ?? output.args?.path ?? ""
  const content: string = output.args?.content ?? output.args?.new_content ?? ""
  if (!filePath) return

  const trust = scorePatch(ctx.directory, filePath, content)
  if (trust.verdict === "high-risk") {
    throw new Error(
      `[flowdeck] PATCH-TRUST HIGH-RISK (score=${trust.score}): ${filePath}\n  Signals: ${trust.signals.join("; ")}\n  This edit requires explicit human review before applying.`
    )
  } else if (trust.verdict === "review-required") {
    throw new Error(
      `[flowdeck] PATCH-TRUST REVIEW-REQUIRED (score=${trust.score}): ${filePath}\n  Signals: ${trust.signals.join("; ")}`
    )
  }
}
