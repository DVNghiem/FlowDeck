; TypeScript-only declaration forms.
;
; Concatenated onto `javascript.scm` at compile time (see queries/mod.rs), so
; only the forms that do not exist in JavaScript live here.

(interface_declaration name: (_) @name) @definition.interface
(abstract_class_declaration name: (_) @name) @definition.class
(enum_declaration name: (_) @name) @definition.enum
(type_alias_declaration name: (_) @name) @definition.type
(internal_module name: (_) @name) @definition.module

; Ambient / overload signatures carry no body but are still definitions.
(function_signature name: (_) @name) @definition.function
(method_signature name: (_) @name) @definition.method
(abstract_method_signature name: (_) @name) @definition.method
