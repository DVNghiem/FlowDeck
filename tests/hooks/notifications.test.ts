/**
 * NotificationController Tests
 *
 * Covers the core timing contract:
 * - No notification when a command is merely entered (command.execute.before)
 * - Notification fires on session.idle after a completion command
 * - Notification fires on session.idle after an interactive command
 * - Notification fires on session.error
 * - Duplicate notifications are suppressed
 * - Long-running command only notifies at the correct lifecycle point
 * - Generic (non-command) idle notification fires only when edits exist
 */

import { describe, it, expect, beforeEach } from "vitest"
import { NotificationController, normalizeCommandName, type NotifyLevel } from "@/hooks/notifications"

// ── Stub ───────────────────────────────────────────────────────────────────

type NotifyCall = { title: string; body: string; level: NotifyLevel }

function makeStub() {
  const calls: NotifyCall[] = []
  const notifyStub = (title: string, body: string, level: NotifyLevel = "info") => {
    calls.push({ title, body, level })
  }
  return { calls, notifyStub }
}

function makeCtrl(stub = makeStub()) {
  const logs: string[] = []
  const ctrl = new NotificationController(stub.notifyStub, (msg) => logs.push(msg))
  return { ctrl, calls: stub.calls, logs }
}

// ── normalizeCommandName ───────────────────────────────────────────────────

describe("normalizeCommandName", () => {
  it("strips leading slash", () => {
    expect(normalizeCommandName("/discuss")).toBe("discuss")
  })

  it("strips fd- prefix", () => {
    expect(normalizeCommandName("fd-plan")).toBe("plan")
  })

  it("strips both slash and fd- prefix", () => {
    expect(normalizeCommandName("/fd-execute")).toBe("execute")
  })

  it("leaves bare name unchanged", () => {
    expect(normalizeCommandName("done")).toBe("done")
  })
})

// ── No notification on command entry ──────────────────────────────────────

describe("NotificationController: no notification on command entry", () => {
  it("does not fire notify when onCommandExecuted is called (command entered, not completed)", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-execute")
    expect(calls).toHaveLength(0)
  })

  it("does not fire notify for interactive commands on entry", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-discuss")
    expect(calls).toHaveLength(0)
  })

  it("does not fire notify for unknown/untracked commands on entry", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-status")
    expect(calls).toHaveLength(0)
  })
})

// ── Completion commands notify on session.idle ─────────────────────────────

describe("NotificationController: completion commands notify on session.idle", () => {
  const completionCommands = [
    "new-feature", "fix-bug", "write-docs", "checkpoint", "done", "execute", "verify",
  ]

  for (const cmd of completionCommands) {
    it(`fires 'completed' notification after /${cmd} on session.idle`, () => {
      const { ctrl, calls } = makeCtrl()

      ctrl.onCommandExecuted(`/fd-${cmd}`)
      expect(calls).toHaveLength(0) // command entered — no notification yet

      ctrl.onSessionIdle(false)
      expect(calls).toHaveLength(1)
      expect(calls[0].title).toContain(cmd)
      expect(calls[0].title).toContain("complete")
      expect(calls[0].level).toBe("info")
    })
  }
})

// ── Interactive commands notify on session.idle ────────────────────────────

describe("NotificationController: interactive commands notify on session.idle", () => {
  const interactiveCommands = ["discuss", "plan", "deploy-check", "ask", "resume"]

  for (const cmd of interactiveCommands) {
    it(`fires 'input_required' notification after /${cmd} on session.idle`, () => {
      const { ctrl, calls } = makeCtrl()

      ctrl.onCommandExecuted(`/fd-${cmd}`)
      expect(calls).toHaveLength(0) // command entered — no notification yet

      ctrl.onSessionIdle(false)
      expect(calls).toHaveLength(1)
      expect(calls[0].body).toMatch(/input is needed/i)
      expect(calls[0].level).toBe("critical")
    })
  }
})

// ── Duplicate suppression ──────────────────────────────────────────────────

describe("NotificationController: duplicate suppression", () => {
  it("does not fire a second notification if session.idle fires again before a new command", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-execute")
    ctrl.onSessionIdle(false)
    const countAfterFirst = calls.length

    ctrl.onSessionIdle(false) // fires again — should be suppressed
    expect(calls.length).toBe(countAfterFirst) // no new entries
  })

  it("fires again after a new command is executed", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-execute")
    ctrl.onSessionIdle(false)
    const afterFirst = calls.length

    ctrl.onCommandExecuted("/fd-verify")
    ctrl.onSessionIdle(false)
    expect(calls.length).toBe(afterFirst + 1)
    expect(calls[calls.length - 1].title).toContain("verify")
  })

  it("does not repeat the same error message", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onSessionError("provider rate limited")
    const afterFirst = calls.length

    ctrl.onSessionError("provider rate limited")
    expect(calls.length).toBe(afterFirst) // suppressed
  })

  it("fires a second error notification for a different message", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onSessionError("error A")
    ctrl.onSessionError("error B")
    expect(calls.length).toBe(2)
  })
})

// ── session.error ──────────────────────────────────────────────────────────

describe("NotificationController: session.error", () => {
  it("fires a critical notification on session.error", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onSessionError("API key invalid")
    expect(calls).toHaveLength(1)
    expect(calls[0].level).toBe("critical")
    expect(calls[0].title).toContain("Error")
  })

  it("clears pending command on session.error so idle does not double-notify", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-execute")
    ctrl.onSessionError("something went wrong")
    const afterError = calls.length

    ctrl.onSessionIdle(false)
    expect(calls.length).toBe(afterError) // no additional notification
  })
})

// ── Generic idle (no command tracked) ─────────────────────────────────────

describe("NotificationController: generic idle", () => {
  it("fires generic notification when idle with edits but no pending command", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onSessionIdle(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].level).toBe("info")
  })

  it("does NOT fire when idle with no edits and no pending command", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onSessionIdle(false)
    expect(calls).toHaveLength(0)
  })

  it("suppresses duplicate generic idle notifications", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onSessionIdle(true)
    const afterFirst = calls.length
    ctrl.onSessionIdle(true)
    expect(calls.length).toBe(afterFirst) // suppressed
  })
})

// ── Long-running command lifecycle ─────────────────────────────────────────

describe("NotificationController: long-running command lifecycle", () => {
  it("does not notify during command execution, only at session.idle", () => {
    const { ctrl, calls } = makeCtrl()

    ctrl.onCommandExecuted("/fd-new-feature")
    expect(calls).toHaveLength(0) // command entered — silent

    ctrl.onSessionIdle(false) // agent done
    expect(calls).toHaveLength(1)

    // No second notification without a new command
    ctrl.onSessionIdle(false)
    expect(calls).toHaveLength(1)
  })

  it("fires fresh notification after reset()", () => {
    const { ctrl, calls } = makeCtrl()
    ctrl.onCommandExecuted("/fd-execute")
    ctrl.onSessionIdle(false)
    const afterFirst = calls.length

    ctrl.reset()
    ctrl.onCommandExecuted("/fd-execute")
    ctrl.onSessionIdle(false)
    expect(calls.length).toBe(afterFirst + 1)
  })
})

// ── State accessors ────────────────────────────────────────────────────────

describe("NotificationController: internal state", () => {
  it("getPendingCommand returns null initially", () => {
    const { ctrl } = makeCtrl()
    expect(ctrl.getPendingCommand()).toBeNull()
  })

  it("getPendingCommand returns command after onCommandExecuted", () => {
    const { ctrl } = makeCtrl()
    ctrl.onCommandExecuted("/fd-plan")
    expect(ctrl.getPendingCommand()).toBe("plan")
  })

  it("getPendingCommand clears to null after session.idle fires notification", () => {
    const { ctrl } = makeCtrl()
    ctrl.onCommandExecuted("/fd-plan")
    ctrl.onSessionIdle(false)
    expect(ctrl.getPendingCommand()).toBeNull()
  })
})

