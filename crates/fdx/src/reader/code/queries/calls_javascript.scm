; Call sites for JavaScript. Also used verbatim for TypeScript.
;
; Capture names encode the CALL SHAPE, which bounds how confidently the call can
; resolve. A qualified call carries no type information about its receiver, so it
; can never earn High confidence no matter how the name matches.

; foo()  — a free function or an imported name.
((call_expression function: (identifier) @name) @call.unqualified
 (#not-eq? @name "require"))

; x.foo()  — receiver type unknown.
(call_expression
  function: (member_expression property: (property_identifier) @name)) @call.qualified

; new Foo()
(new_expression constructor: (identifier) @name) @call.constructor
