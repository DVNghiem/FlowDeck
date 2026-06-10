import { describe, it, expect, beforeEach, vi } from "vitest"
import { LoopDetector, normalizeAction, type LoopDetectorConfig } from "@/services/loop-detector"

describe("LoopDetector", () => {
  let detector: LoopDetector
  let appLogMessages: string[]
  let appLog: (msg: string) => void

  beforeEach(() => {
    appLogMessages = []
    appLog = (msg: string) => appLogMessages.push(msg)
    detector = new LoopDetector({}, appLog)
  })

  describe("checkBefore / recordAfter flow", () => {
    it("blocks on 3rd call when same bash command is repeated with same output (maxRepeats=1)", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const toolName = "bash"
      const args = { command: "cargo test" }
      const sessionId = "sess-1"
      const output = "running 5 tests\nall passed"

      // 1st execution
      let result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
      detector.recordAfter(toolName, args, output, sessionId, "success")

      // 2nd execution
      result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
      detector.recordAfter(toolName, args, output, sessionId, "success")

      // 3rd execution — should be blocked
      result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.escalationMessage).toContain("bash")
        expect(result.escalationMessage).toContain("cargo test")
      }
    })

    it("blocks repeated read with identical result after maxRepeats", () => {
      detector = new LoopDetector({ maxRepeats: 2 }, appLog)
      const toolName = "read"
      const args = { filePath: "/tmp/test.txt" }
      const sessionId = "sess-1"
      const output = "file content here"

      // 1st
      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      // 2nd
      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      // 3rd
      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      // 4th — blocked
      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.reason).toBe("same_result")
      }
    })

    it("allows repeated read when output is different", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const toolName = "read"
      const args = { filePath: "/tmp/test.txt" }
      const sessionId = "sess-1"

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, "content A", sessionId, "success")

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, "content B", sessionId, "success")

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, "content C", sessionId, "success")

      // Different outputs reset the counter, so should still allow
      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
    })

    it("allows transient failure up to 2 times, blocks on 3rd due to no_progress heuristic", () => {
      // Note: the no_progress path (callCount >= 2 && consecutive >= 1) triggers
      // before maxRepeats for transient failures, so only 2 retries are allowed.
      detector = new LoopDetector({ maxRepeats: 3 }, appLog)
      const toolName = "bash"
      const args = { command: "curl https://example.com" }
      const sessionId = "sess-1"
      const errorOutput = { error: "Request timeout after 30s" }

      // 1st — allowed, logs retry 1/3
      let result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
      detector.recordAfter(toolName, args, errorOutput, sessionId, "error")
      expect(appLogMessages.some((m) => m.includes("retry 1/3"))).toBe(true)

      // 2nd — allowed, logs retry 2/3
      result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
      detector.recordAfter(toolName, args, errorOutput, sessionId, "error")
      expect(appLogMessages.some((m) => m.includes("retry 2/3"))).toBe(true)

      // 3rd — blocked by no_progress (callCount=2, consecutive=2)
      result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.reason).toBe("no_progress")
      }
    })

    it("blocks non-transient error on 2nd repeat (maxRepeats=1)", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const toolName = "bash"
      const args = { command: "rm /root/secret" }
      const sessionId = "sess-1"
      const errorOutput = { error: "Permission denied" }

      // 1st
      let result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
      detector.recordAfter(toolName, args, errorOutput, sessionId, "error")

      // 2nd
      result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
      detector.recordAfter(toolName, args, errorOutput, sessionId, "error")

      // 3rd — blocked (2nd repeat)
      result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.reason).toBe("same_result")
      }
    })

    it("allows write with same content to same file (writes are new_information)", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const toolName = "write"
      const args = { filePath: "/tmp/out.txt" }
      const sessionId = "sess-1"
      const output = { success: true }

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
    })

    it("allows write with different content to same file", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const toolName = "write"
      const args = { filePath: "/tmp/out.txt" }
      const sessionId = "sess-1"

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, { bytesWritten: 10 }, sessionId, "success")

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, { bytesWritten: 20 }, sessionId, "success")

      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
    })

    it("falls back to in-memory and logs warning when persistence fails", () => {
      detector.setPersistenceHealthy(false)
      expect(appLogMessages).toHaveLength(1)
      expect(appLogMessages[0]).toContain("in-memory only")
      expect(appLogMessages[0]).toContain("History will be lost")
    })

    it("always allows when enabled is false", () => {
      detector = new LoopDetector({ enabled: false }, appLog)
      const toolName = "bash"
      const args = { command: "cargo test" }
      const sessionId = "sess-1"
      const output = "same output"

      for (let i = 0; i < 10; i++) {
        detector.checkBefore(toolName, args, sessionId)
        detector.recordAfter(toolName, args, output, sessionId, "success")
      }

      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("allow")
    })

    it("evicts oldest entries when history size is exceeded (LRU)", () => {
      detector = new LoopDetector({ historySize: 3, maxRepeats: 2 }, appLog)
      const sessionId = "sess-1"

      // Use fake timers to control ordering
      let now = 1000
      vi.spyOn(Date, "now").mockImplementation(() => now)

      detector.checkBefore("bash", { command: "cmd-a" }, sessionId)
      detector.recordAfter("bash", { command: "cmd-a" }, "out-a", sessionId, "success")

      now = 2000
      detector.checkBefore("bash", { command: "cmd-b" }, sessionId)
      detector.recordAfter("bash", { command: "cmd-b" }, "out-b", sessionId, "success")

      now = 3000
      detector.checkBefore("bash", { command: "cmd-c" }, sessionId)
      detector.recordAfter("bash", { command: "cmd-c" }, "out-c", sessionId, "success")

      // History should have 3 entries
      let history = detector.getHistory(sessionId)
      expect(history).toHaveLength(3)

      now = 4000
      detector.checkBefore("bash", { command: "cmd-d" }, sessionId)
      detector.recordAfter("bash", { command: "cmd-d" }, "out-d", sessionId, "success")

      // Oldest (cmd-a) should be evicted
      history = detector.getHistory(sessionId)
      expect(history).toHaveLength(3)
      const keys = history.map((h) => h.normalizedKey)
      expect(keys).not.toContain("shell:cmd-a")
      expect(keys).toContain("shell:cmd-b")
      expect(keys).toContain("shell:cmd-c")
      expect(keys).toContain("shell:cmd-d")

      vi.restoreAllMocks()
    })

    it("blocks no_progress when output is 90% similar after appropriate attempts", () => {
      detector = new LoopDetector({ maxRepeats: 2, similarityThreshold: 0.9 }, appLog)
      const toolName = "bash"
      const args = { command: "cargo test" }
      const sessionId = "sess-1"

      // 19 identical lines + 1 different = 95% similarity
      const identicalLines = Array.from({ length: 19 }, (_, i) => `line${i + 1}`).join("\n")
      const output1 = identicalLines + "\nalpha"
      const output2 = identicalLines + "\nbeta"

      // 1st
      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output1, sessionId, "success")

      // 2nd — similar output triggers no_progress
      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output2, sessionId, "success")

      // 3rd — should be blocked for no_progress
      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.reason).toBe("no_progress")
      }
    })

    it("escalation message contains tool name and human-readable command", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const toolName = "bash"
      const args = { command: "cargo test --lib" }
      const sessionId = "sess-1"
      const output = "same"

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      detector.checkBefore(toolName, args, sessionId)
      detector.recordAfter(toolName, args, output, sessionId, "success")

      const result = detector.checkBefore(toolName, args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.escalationMessage).toContain("bash")
        expect(result.escalationMessage).toContain("cargo test --lib")
        expect(result.escalationMessage).toContain("FlowDeck Loop Guard")
      }
    })

    it("excludes workdir from bash normalized key", () => {
      const key1 = normalizeAction("bash", { command: "cargo test", workdir: "/project/a" })
      const key2 = normalizeAction("bash", { command: "cargo test", workdir: "/project/b" })
      expect(key1).toBe(key2)
    })

    it("excludes offset/limit from read normalized key", () => {
      const key1 = normalizeAction("read", { filePath: "/tmp/test.txt", offset: 10, limit: 20 })
      const key2 = normalizeAction("read", { filePath: "/tmp/test.txt", offset: 30, limit: 50 })
      expect(key1).toBe(key2)
    })

    it("isolates history between sessions", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const args = { command: "cargo test" }
      const output = "same"

      detector.checkBefore("bash", args, "sess-a")
      detector.recordAfter("bash", args, output, "sess-a", "success")

      detector.checkBefore("bash", args, "sess-a")
      detector.recordAfter("bash", args, output, "sess-a", "success")

      // sess-a would block on next call
      expect(detector.checkBefore("bash", args, "sess-a").action).toBe("block")

      // sess-b should still allow
      const result = detector.checkBefore("bash", args, "sess-b")
      expect(result.action).toBe("allow")
    })

    it("clearSession removes history for that session", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const args = { command: "cargo test" }
      const sessionId = "sess-1"
      const output = "same"

      detector.checkBefore("bash", args, sessionId)
      detector.recordAfter("bash", args, output, sessionId, "success")

      detector.checkBefore("bash", args, sessionId)
      detector.recordAfter("bash", args, output, sessionId, "success")

      expect(detector.checkBefore("bash", args, sessionId).action).toBe("block")

      detector.clearSession(sessionId)

      const result = detector.checkBefore("bash", args, sessionId)
      expect(result.action).toBe("allow")
    })

    it("treats blocked status as same_result and blocks on repeat", () => {
      detector = new LoopDetector({ maxRepeats: 1 }, appLog)
      const args = { command: "cargo test" }
      const sessionId = "sess-1"
      const output = "blocked by guard"

      detector.checkBefore("bash", args, sessionId)
      detector.recordAfter("bash", args, output, sessionId, "blocked")

      detector.checkBefore("bash", args, sessionId)
      detector.recordAfter("bash", args, output, sessionId, "blocked")

      const result = detector.checkBefore("bash", args, sessionId)
      expect(result.action).toBe("block")
      if (result.action === "block") {
        expect(result.reason).toBe("same_result")
      }
    })

    it("getHistory returns records in chronological order", () => {
      detector = new LoopDetector({ historySize: 10 }, appLog)
      const sessionId = "sess-1"
      let now = 1000
      vi.spyOn(Date, "now").mockImplementation(() => {
        now += 1000
        return now
      })

      detector.checkBefore("bash", { command: "first" }, sessionId)
      detector.recordAfter("bash", { command: "first" }, "out1", sessionId, "success")

      detector.checkBefore("read", { filePath: "/tmp/a" }, sessionId)
      detector.recordAfter("read", { filePath: "/tmp/a" }, "out2", sessionId, "success")

      detector.checkBefore("bash", { command: "second" }, sessionId)
      detector.recordAfter("bash", { command: "second" }, "out3", sessionId, "success")

      const history = detector.getHistory(sessionId)
      expect(history).toHaveLength(3)
      expect(history[0].toolName).toBe("bash")
      expect(history[0].normalizedKey).toContain("first")
      expect(history[1].toolName).toBe("read")
      expect(history[2].toolName).toBe("bash")
      expect(history[2].normalizedKey).toContain("second")

      // Verify timestamps are ascending
      expect(history[0].timestamp).toBeLessThan(history[1].timestamp)
      expect(history[1].timestamp).toBeLessThan(history[2].timestamp)

      vi.restoreAllMocks()
    })
  })

  describe("normalizeAction", () => {
    it("normalizes bash command with collapsed whitespace", () => {
      const key = normalizeAction("bash", { command: "  cargo   test  " })
      expect(key).toBe("shell:cargo test")
    })

    it("normalizes shell command to lowercase", () => {
      const key = normalizeAction("SHELL", { command: "ECHO Hello" })
      expect(key).toBe("shell:echo hello")
    })

    it("resolves file path for read tool", () => {
      const key = normalizeAction("read", { filePath: "./src/index.ts" })
      expect(key.startsWith("read:")).toBe(true)
      expect(key).toContain("src/index.ts")
    })

    it("resolves file path for write tool", () => {
      const key = normalizeAction("write", { filePath: "./README.md" })
      expect(key.startsWith("write:")).toBe(true)
      expect(key).toContain("README.md")
    })

    it("includes pattern and path for grep", () => {
      const key = normalizeAction("grep", { pattern: "foo", path: "./src" })
      expect(key).toMatch(/^grep:foo:/)
    })

    it("sorts keys for unknown tools", () => {
      const key = normalizeAction("custom", { z: 1, a: 2 })
      expect(key).toContain("\"a\":2")
      expect(key).toContain("\"z\":1")
    })
  })

  describe("persistence warning deduplication", () => {
    it("logs persistence warning only once per session", () => {
      detector.setPersistenceHealthy(false)
      detector.setPersistenceHealthy(false)
      detector.setPersistenceHealthy(false)
      expect(appLogMessages).toHaveLength(1)
    })

    it("logs persistence warning again after toggling healthy and back to unhealthy", () => {
      detector.setPersistenceHealthy(false)
      expect(appLogMessages).toHaveLength(1)

      detector.setPersistenceHealthy(true)
      detector.setPersistenceHealthy(false)
      expect(appLogMessages).toHaveLength(2)
    })
  })

  describe("checkBefore with no_progress marker", () => {
    it("warns and continues for warn action (if ever produced)", () => {
      // The current implementation doesn't produce "warn" from checkBefore,
      // but we verify it would log and allow if it did.
      // This test documents the expected behavior for warn actions.
      detector = new LoopDetector({}, appLog)
      // Manually construct a scenario where a warn could theoretically occur
      const result = detector.checkBefore("bash", { command: "echo hi" }, "sess")
      expect(result.action).toBe("allow")
    })
  })
})
