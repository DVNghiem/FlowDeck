/**
 * Shared Impact Radar utility.
 * Scans .codebase/ data stores for risk signals relevant to a change description.
 * Used by /fd-discuss, /fd-plan, /fd-new-feature, and /fd-fix-bug.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir } from "../tools/codebase-state"
import type { FailureEntry } from "../tools/failure-replay"

export interface ImpactRadarResult {
  hotspots: Array<{ path: string; stability: string }>
  known_failures: Array<{ id: string; description: string; affected_paths: string[]; recurrence_count: number }>
  related_modules: Array<{ path: string; type: string; owner?: string }>
  risk_flag: boolean
  score: number
  advisory: string | null
}

function matchWords(text: string, words: string[]): boolean {
  const lower = text.toLowerCase()
  return words.some(w => w.length > 3 && lower.includes(w))
}

export function runImpactRadar(dir: string, changeText: string): ImpactRadarResult {
  const cd = codebaseDir(dir)
  const words = changeText.toLowerCase().split(/\s+/)

  const hotspots: ImpactRadarResult["hotspots"] = []
  const known_failures: ImpactRadarResult["known_failures"] = []
  const related_modules: ImpactRadarResult["related_modules"] = []

  const volatilityPath = join(cd, "VOLATILITY.json")
  if (existsSync(volatilityPath)) {
    try {
      const v = JSON.parse(readFileSync(volatilityPath, "utf-8"))
      for (const e of v.entries ?? []) {
        if ((e.stability === "volatile" || e.stability === "critical") && matchWords(e.path, words)) {
          hotspots.push({ path: e.path, stability: e.stability })
        }
      }
    } catch { /* ignore */ }
  }

  const failuresPath = join(cd, "FAILURES.json")
  if (existsSync(failuresPath)) {
    try {
      const f = JSON.parse(readFileSync(failuresPath, "utf-8"))
      for (const e of f.entries ?? []) {
        if (!e.tags?.includes("resolved") && matchWords(e.description ?? "", words)) {
          known_failures.push({
            id: e.id,
            description: e.description,
            affected_paths: e.affected_paths ?? [],
            recurrence_count: e.recurrence_count ?? 1,
          })
        }
      }
    } catch { /* ignore */ }
  }

  const memoryPath = join(cd, "MEMORY.json")
  if (existsSync(memoryPath)) {
    try {
      const m = JSON.parse(readFileSync(memoryPath, "utf-8"))
      for (const node of Object.values(m.nodes ?? {}) as any[]) {
        if (matchWords(node.path ?? "", words)) {
          related_modules.push({ path: node.path, type: node.type, owner: node.owner })
        }
      }
    } catch { /* ignore */ }
  }

  const risk_flag = hotspots.length > 0 || known_failures.length > 0
  const advisory = risk_flag
    ? `⚠ Impact Radar: ${hotspots.length} volatile zone(s) and ${known_failures.length} known failure(s) match this change. Review before proceeding.`
    : null

  return { hotspots, known_failures, related_modules, risk_flag, advisory, score: risk_flag ? 0.7 : 0.3 }
}

export function impactRadarSummaryLines(radar: ImpactRadarResult): string[] {
  if (!radar.risk_flag && radar.related_modules.length === 0) return []
  const lines: string[] = ["─".repeat(55), "  Impact Radar:"]
  if (radar.hotspots.length > 0) {
    lines.push(`  ⚠ Volatile zones: ${radar.hotspots.map(h => h.path).join(", ")}`)
  }
  if (radar.known_failures.length > 0) {
    lines.push(`  ⚠ Known failures: ${radar.known_failures.map(f => f.id).join(", ")}`)
  }
  if (radar.related_modules.length > 0) {
    lines.push(`  ℹ Related modules: ${radar.related_modules.map(m => m.path).join(", ")}`)
  }
  return lines
}

/**
 * Look up prior failures from FAILURES.json that match by path prefix or keyword.
 * Returns full FailureEntry objects (including root_cause and fix_applied) sorted by recurrence desc.
 * Used by /fd-fix-bug to surface lessons learned before the fix begins.
 */
export function lookupPriorFailures(
  dir: string,
  scope: string,
  bugText: string,
  limit = 5
): FailureEntry[] {
  const cd = codebaseDir(dir)
  const failuresPath = join(cd, "FAILURES.json")
  if (!existsSync(failuresPath)) return []

  try {
    const store = JSON.parse(readFileSync(failuresPath, "utf-8"))
    const entries: FailureEntry[] = store.entries ?? []
    const words = bugText.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const scopePrefix = scope !== "all" ? scope.replace(/^\.\//, "") : ""

    const matched = entries
      .filter(e => !e.tags?.includes("resolved"))
      .filter(e => {
        const pathMatch = scopePrefix
          ? e.affected_paths.some(p => p.includes(scopePrefix))
          : false
        const keywordMatch = words.some(w => (e.description ?? "").toLowerCase().includes(w))
        return pathMatch || keywordMatch
      })
      .sort((a, b) => (b.recurrence_count ?? 1) - (a.recurrence_count ?? 1))

    return matched.slice(0, limit)
  } catch {
    return []
  }
}
