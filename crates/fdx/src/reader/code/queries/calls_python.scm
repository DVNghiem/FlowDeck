; Call sites for Python.

; foo()
(call function: (identifier) @name) @call.unqualified

; x.foo()  — receiver type unknown.
(call function: (attribute attribute: (identifier) @name)) @call.qualified
