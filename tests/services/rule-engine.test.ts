/**
 * Rule Engine Tests
 *
 * Covers:
 * - checkFileExists: returns true for existing, false for missing
 * - checkJSONValid: valid JSON returns true, invalid returns false + error
 * - detectLanguage: maps extensions to languages, null for unknown
 * - classifyCommandType: prefix-based classification
 * - checkIsNonEmpty: trims whitespace before checking
 * - checkContainsKeyword: case-insensitive, returns matched keyword
 * - deterministic flag always true
 */
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  checkFileExists,
  checkJSONValid,
  detectLanguage,
  classifyCommandType,
  checkIsNonEmpty,
  checkContainsKeyword,
} from "@/services/rule-engine"

describe("checkFileExists", () => {
  it("returns true for existing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "rule-engine-test-"))
    try {
      const file = join(dir, "test.ts")
      writeFileSync(file, "content")
      const result = checkFileExists(file)
      expect(result.value).toBe(true)
      expect(result.deterministic).toBe(true)
      expect(result.type).toBe("file_exists")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns false for missing file", () => {
    const result = checkFileExists("/nonexistent/path/file.ts")
    expect(result.value).toBe(false)
    expect(result.deterministic).toBe(true)
  })
})

describe("checkJSONValid", () => {
  it("valid JSON returns valid: true", () => {
    const result = checkJSONValid('{"key": "value"}')
    expect(result.value.valid).toBe(true)
    expect(result.value.error).toBeUndefined()
    expect(result.deterministic).toBe(true)
  })

  it("invalid JSON returns valid: false with error", () => {
    const result = checkJSONValid("{invalid json}")
    expect(result.value.valid).toBe(false)
    expect(result.value.error).toBeDefined()
    expect(typeof result.value.error).toBe("string")
  })

  it("empty string is invalid JSON", () => {
    const result = checkJSONValid("")
    expect(result.value.valid).toBe(false)
  })

  it("JSON array is valid", () => {
    const result = checkJSONValid('[1, 2, 3]')
    expect(result.value.valid).toBe(true)
  })
})

describe("detectLanguage", () => {
  it("detects TypeScript from .ts", () => {
    expect(detectLanguage("file.ts").value).toBe("typescript")
  })

  it("detects TypeScript from .tsx", () => {
    expect(detectLanguage("component.tsx").value).toBe("typescript")
  })

  it("detects Python from .py", () => {
    expect(detectLanguage("script.py").value).toBe("python")
  })

  it("detects Go from .go", () => {
    expect(detectLanguage("main.go").value).toBe("go")
  })

  it("returns null for unknown extension", () => {
    expect(detectLanguage("file.xyz").value).toBeNull()
  })

  it("handles files with no extension", () => {
    expect(detectLanguage("Makefile").value).toBeNull()
  })

  it("is case-insensitive on extension", () => {
    expect(detectLanguage("file.TS").value).toBe("typescript")
  })

  it("type is detect_language and deterministic: true", () => {
    const result = detectLanguage("file.py")
    expect(result.type).toBe("detect_language")
    expect(result.deterministic).toBe(true)
  })
})

describe("classifyCommandType", () => {
  it("get prefix → read", () => {
    expect(classifyCommandType("getFile").value).toBe("read")
  })

  it("read prefix → read", () => {
    expect(classifyCommandType("readState").value).toBe("read")
  })

  it("write prefix → write", () => {
    expect(classifyCommandType("writeFile").value).toBe("write")
  })

  it("create prefix → write", () => {
    expect(classifyCommandType("createRecord").value).toBe("write")
  })

  it("delete prefix → delete", () => {
    expect(classifyCommandType("deleteCache").value).toBe("delete")
  })

  it("run prefix → run", () => {
    expect(classifyCommandType("runTests").value).toBe("run")
  })

  it("build prefix → run", () => {
    expect(classifyCommandType("buildProject").value).toBe("run")
  })

  it("navigate prefix → navigate", () => {
    expect(classifyCommandType("navigate_stage").value).toBe("navigate")
  })

  it("unknown prefix → unknown", () => {
    expect(classifyCommandType("doSomethingWeird").value).toBe("unknown")
  })

  it("is case-insensitive", () => {
    expect(classifyCommandType("GET_DATA").value).toBe("read")
  })

  it("type is classify_command and deterministic: true", () => {
    const result = classifyCommandType("getFile")
    expect(result.type).toBe("classify_command")
    expect(result.deterministic).toBe(true)
  })
})

describe("checkIsNonEmpty", () => {
  it("non-empty string → true", () => {
    expect(checkIsNonEmpty("hello").value).toBe(true)
  })

  it("empty string → false", () => {
    expect(checkIsNonEmpty("").value).toBe(false)
  })

  it("whitespace-only → false", () => {
    expect(checkIsNonEmpty("   \n\t  ").value).toBe(false)
  })

  it("deterministic: true", () => {
    expect(checkIsNonEmpty("x").deterministic).toBe(true)
  })
})

describe("checkContainsKeyword", () => {
  it("finds a keyword case-insensitively", () => {
    const result = checkContainsKeyword("This is an Error message", ["error", "warning"])
    expect(result.value.found).toBe(true)
    expect(result.value.matched).toBe("error")
  })

  it("returns found: false when no keyword matches", () => {
    const result = checkContainsKeyword("all good here", ["error", "warning"])
    expect(result.value.found).toBe(false)
    expect(result.value.matched).toBeUndefined()
  })

  it("handles empty keywords array", () => {
    const result = checkContainsKeyword("anything", [])
    expect(result.value.found).toBe(false)
  })

  it("deterministic: true", () => {
    expect(checkContainsKeyword("x", ["x"]).deterministic).toBe(true)
  })
})
