/**
 * Codegraph Readiness Service
 *
 * Reports codegraph state (installed/indexed/fresh/action) without mutating
 * the project. Network install is only attempted when
 * FLOWDECK_CODEGRAPH_AUTO_INSTALL=1.
 */

import {
  isCodegraphInstalled,
  isCodegraphIndexed,
  isCodegraphFresh,
  hasChangedSinceLastIndex,
  readCodegraphMeta,
} from "./codegraph"

export interface CodegraphReadiness {
  installed: boolean
  indexed: boolean
  fresh: boolean
  hasChangedSinceLastIndex: boolean
  status: "ready" | "missing" | "stale" | "action_required"
  action: string | null
  mcpAvailable: boolean
}

export function getCodegraphReadiness(dir: string): CodegraphReadiness {
  const installed = isCodegraphInstalled()
  const indexed = isCodegraphIndexed(dir)
  const fresh = isCodegraphFresh(dir)
  const changed = hasChangedSinceLastIndex(dir)
  const meta = readCodegraphMeta(dir)

  let status: CodegraphReadiness["status"] = "ready"
  let action: string | null = null

  if (!installed) {
    status = "missing"
    const autoInstall = process.env.FLOWDECK_CODEGRAPH_AUTO_INSTALL === "1"
    action = autoInstall
      ? "codegraph auto-install enabled — run codegraph action=install then init"
      : "codegraph CLI not installed. Install it or set FLOWDECK_CODEGRAPH_AUTO_INSTALL=1 to allow auto-install."
  } else if (!indexed) {
    status = "action_required"
    action = "codegraph installed but not indexed — run codegraph action=init"
  } else if (!fresh || changed) {
    status = "stale"
    action = "codegraph index stale — run codegraph action=refresh"
  }

  return {
    installed,
    indexed,
    fresh,
    hasChangedSinceLastIndex: changed,
    status,
    action,
    mcpAvailable: installed && indexed,
  }
}

export function formatReadiness(readiness: CodegraphReadiness): string {
  if (readiness.status === "ready") return "codegraph ready"
  return `codegraph ${readiness.status}: ${readiness.action}`
}
