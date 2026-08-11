use std::fs::File;
use std::io::Write;

use fdx::reader::office::docx::parse_docx;
use zip::write::SimpleFileOptions;

#[test]
fn docx_with_paragraphs_and_table_renders_markdown() {
    let dir = format!("/tmp/fdx_office_docx/{}", "docx_with_paragraphs_and_table_renders_markdown");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = format!("{dir}/spec.docx");

    let document_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>First paragraph.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Second paragraph with </w:t></w:r><w:r><w:t>two runs.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Header A</w:t></w:r></w:p></w:tc>
           <w:tc><w:p><w:r><w:t>Header B</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>cell 1</w:t></w:r></w:p></w:tc>
           <w:tc><w:p><w:r><w:t>cell 2</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:body>
</w:document>"#;

    let f = File::create(&path).unwrap();
    let mut zip = zip::ZipWriter::new(f);
    zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(
        br#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#,
    )
    .unwrap();
    zip.start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(document_xml.as_bytes()).unwrap();
    zip.finish().unwrap();

    let mut warnings = Vec::new();
    let md = parse_docx(std::path::Path::new(&path), &mut warnings).unwrap();

    assert!(md.contains("First paragraph."), "got: {md}");
    assert!(md.contains("Second paragraph with two runs."), "got: {md}");
    assert!(md.contains("| Header A | Header B |"), "got: {md}");
    assert!(md.contains("| --- | --- |") || md.contains("|---|---|"), "got: {md}");
    assert!(md.contains("cell 1"), "got: {md}");
    assert!(warnings.is_empty(), "warnings: {warnings:?}");

    let _ = std::fs::remove_dir_all(&dir);
}
