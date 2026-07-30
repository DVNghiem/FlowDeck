; Import specifiers for Rust.

(use_declaration argument: (_) @import.source) @import

; `mod foo;` refers to another file; `mod foo { ... }` is an inline definition.
; A query cannot express "has no body", so the extractor filters on the absence
; of a `body` field for this capture.
(mod_item name: (_) @import.source) @import.mod
