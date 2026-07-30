; Import specifiers for Java.
;
; `import com.example.Fee;` yields `com.example.Fee`. A wildcard
; `import com.example.*;` has an `asterisk` child rather than a name, so it does
; not match and is correctly skipped.

(import_declaration [(scoped_identifier) (identifier)] @import.source) @import
