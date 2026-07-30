; Import specifiers for JavaScript. Also used verbatim for TypeScript.
;
; Two structural properties matter here:
;
;   1. Capturing `string_fragment` rather than `string` drops the quote
;      characters, so `'./b'` and `"./b"` are handled identically. The previous
;      line-based extractor located the specifier with `rfind('"')` and therefore
;      found ZERO imports in any single-quoted codebase.
;
;   2. The pattern matches the whole `import_statement` node, so a multi-line
;      import block works. The previous extractor required `import` and `from` on
;      the same line and skipped multi-line blocks entirely.

(import_statement source: (string (string_fragment) @import.source)) @import

; Re-exports are dependency edges too: `export { a } from "./b"`.
(export_statement source: (string (string_fragment) @import.source)) @import

; CommonJS: `require("./b")`.
((call_expression
   function: (identifier) @_require
   arguments: (arguments (string (string_fragment) @import.source))) @import
 (#eq? @_require "require"))
