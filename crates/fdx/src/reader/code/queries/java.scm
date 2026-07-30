; Symbol definitions for Java.
;
; `method_declaration` is unanchored, which is the fix: methods live under
; `class_body`, never as a direct child of the root, so the old walk found
; ZERO methods in every Java file.

(class_declaration name: (_) @name) @definition.class
(interface_declaration name: (_) @name) @definition.interface
(enum_declaration name: (_) @name) @definition.enum
(record_declaration name: (_) @name) @definition.class

(method_declaration name: (_) @name) @definition.method
(constructor_declaration name: (_) @name) @definition.method
