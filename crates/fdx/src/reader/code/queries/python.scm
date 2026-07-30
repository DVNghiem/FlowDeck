; Symbol definitions for Python.
;
; `function_definition` is unanchored, so it matches decorated functions
; (`decorated_definition` wraps the definition) and class methods alike. The old
; walk matched `decorated_definition` as a symbol node but then dropped it,
; because name extraction looked only at direct children and a decorated
; definition has no direct identifier child.

(class_definition name: (_) @name) @definition.class

; Methods first: any function inside a class body.
(class_definition (block (function_definition name: (_) @name) @definition.method))

; Free functions. Unanchored, so this also matches the methods above; the
; extractor dedupes by byte range and prefers "method".
(function_definition name: (_) @name) @definition.function
