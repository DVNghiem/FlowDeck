; Import specifiers for Java.
;
; `import com.example.Fee;` yields `com.example.Fee`.
;
; A wildcard `import com.example.*;` DOES match this pattern: the asterisk is a
; sibling of the `scoped_identifier`, not part of it, so the package name would
; be captured as though it were a class. The extractor filters anchors with an
; `asterisk` child (see find_imports_via_query), because a package is not a file.

(import_declaration [(scoped_identifier) (identifier)] @import.source) @import
