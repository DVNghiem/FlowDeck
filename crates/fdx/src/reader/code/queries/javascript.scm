; Symbol definitions for JavaScript.
;
; Also used as the base for TypeScript: every node type and field below is
; present in the TypeScript grammar, so this file is concatenated with
; `typescript_extra.scm` and compiled against LANGUAGE_TYPESCRIPT.
;
; Patterns are UNANCHORED, which is the whole point: a `function_declaration`
; wrapped in `export_statement`, or a `method_definition` inside `class_body`,
; matches without any wrapper-unwrapping code.

; ── functions ────────────────────────────────────────────────────────────────
(function_declaration name: (_) @name) @definition.function
(generator_function_declaration name: (_) @name) @definition.function
(function_expression name: (_) @name) @definition.function

; Function values bound to a variable: `const f = (x) => x`, `let g = function () {}`.
; The declarator is captured (not the arrow), so `@name` is the binding name.
(lexical_declaration
  (variable_declarator
    name: (_) @name
    value: [(arrow_function) (function_expression)]) @definition.function)
(variable_declaration
  (variable_declarator
    name: (_) @name
    value: [(arrow_function) (function_expression)]) @definition.function)

; ── classes and methods ──────────────────────────────────────────────────────
(class_declaration name: (_) @name) @definition.class
(method_definition name: (_) @name) @definition.method
