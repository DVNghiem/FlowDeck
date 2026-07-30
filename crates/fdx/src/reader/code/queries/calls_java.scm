; Call sites for Java.

; foo()  — the negated `!object` field is what distinguishes a bare call from a
; receiver call, so this pattern cannot also match `obj.foo()`.
(method_invocation
  !object
  name: (identifier) @name) @call.unqualified

; obj.foo()  — receiver type unknown.
(method_invocation
  object: (_) @qualifier
  name: (identifier) @name) @call.qualified

; new Foo()
(object_creation_expression type: (type_identifier) @name) @call.constructor
