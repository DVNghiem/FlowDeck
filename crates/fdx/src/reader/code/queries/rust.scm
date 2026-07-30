; Symbol definitions for Rust.
;
; `struct_item` maps to `definition.class` deliberately: the pre-existing
; `map_kind` reported structs as "class", and `fdx outline` / `fdx search`
; consumers depend on that string.

; ── type-level items ─────────────────────────────────────────────────────────
(struct_item name: (_) @name) @definition.class
(union_item name: (_) @name) @definition.class
(enum_item name: (_) @name) @definition.enum
(type_item name: (_) @name) @definition.type
(trait_item name: (_) @name) @definition.trait
(mod_item name: (_) @name) @definition.module
(macro_definition name: (_) @name) @definition.macro
(const_item name: (_) @name) @definition.constant
(static_item name: (_) @name) @definition.static

; ── impl blocks ──────────────────────────────────────────────────────────────
; Kept as their own node (kind "impl") so existing outline output is unchanged.
(impl_item type: (_) @name) @definition.impl

; ── methods ──────────────────────────────────────────────────────────────────
; Functions inside an impl or trait body. This is the case the old
; direct-children walk lost entirely: `impl Foo { fn method_a() }` collapsed into
; one opaque `impl Foo` symbol and `method_a` never became a symbol at all.
(impl_item (declaration_list (function_item name: (_) @name) @definition.method))
(trait_item (declaration_list (function_item name: (_) @name) @definition.method))

; ── free functions ───────────────────────────────────────────────────────────
; Unanchored, so this also matches the impl/trait methods above. The extractor
; dedupes by byte range and prefers the more specific "method" kind.
(function_item name: (_) @name) @definition.function
