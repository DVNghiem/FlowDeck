; Import specifiers for Python.
;
; `import a.b` yields the dotted name `a.b`; `from .x import y` yields the
; relative module `.x`. Both are passed to the resolver as-is.

(import_statement name: (_) @import.source) @import
(import_from_statement module_name: (_) @import.source) @import
