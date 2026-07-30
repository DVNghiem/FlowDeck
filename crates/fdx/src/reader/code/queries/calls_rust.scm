; Call sites for Rust.
;
; Written by hand: unlike the other grammars, tree-sitter-rust's own tags.scm
; contains no call patterns at all.

; foo()
(call_expression function: (identifier) @name) @call.unqualified

; Foo::bar() or module::func()  — container named explicitly.
(call_expression
  function: (scoped_identifier
              path: (_) @qualifier
              name: (identifier) @name)) @call.pathscoped

; x.method()  — receiver type unknown.
(call_expression
  function: (field_expression field: (field_identifier) @name)) @call.qualified
