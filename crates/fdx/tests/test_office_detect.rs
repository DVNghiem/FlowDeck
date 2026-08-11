use std::fs::File;
use std::io::Write;

use fdx::reader::office::detect::{detect, OfficeKind};
use zip::write::SimpleFileOptions;

fn write_zip_with_content_types(dir: &str, name: &str, content_types_xml: &str) -> String {
    let path = format!("{dir}/{name}");
    let f = File::create(&path).unwrap();
    let mut zip = zip::ZipWriter::new(f);
    zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(content_types_xml.as_bytes()).unwrap();
    zip.finish().unwrap();
    path
}

#[test]
fn detect_returns_none_for_text_file() {
    let dir = "/tmp/fdx_office_detect/detect_returns_none_for_text_file";
    let _ = std::fs::remove_dir_all(dir);
    std::fs::create_dir_all(dir).unwrap();
    let path = format!("{dir}/note.txt");
    std::fs::write(&path, b"hello world").unwrap();

    assert_eq!(detect(std::path::Path::new(&path)).unwrap(), OfficeKind::None);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn detect_returns_docx_for_wordprocessingml_zip() {
    let dir = "/tmp/fdx_office_detect/detect_returns_docx_for_wordprocessingml_zip";
    let _ = std::fs::remove_dir_all(dir);
    std::fs::create_dir_all(dir).unwrap();
    let ct = r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml"
            ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#;
    let path = write_zip_with_content_types(dir, "doc.docx", ct);

    assert_eq!(detect(std::path::Path::new(&path)).unwrap(), OfficeKind::Docx);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn detect_returns_xlsx_for_spreadsheetml_zip() {
    let dir = "/tmp/fdx_office_detect/detect_returns_xlsx_for_spreadsheetml_zip";
    let _ = std::fs::remove_dir_all(dir);
    std::fs::create_dir_all(dir).unwrap();
    let ct = r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/xl/workbook.xml"
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
</Types>"#;
    let path = write_zip_with_content_types(dir, "sheet.xlsx", ct);

    assert_eq!(detect(std::path::Path::new(&path)).unwrap(), OfficeKind::Xlsx);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn detect_returns_none_for_zip_without_content_types() {
    let dir = "/tmp/fdx_office_detect/detect_returns_none_for_zip_without_content_types";
    let _ = std::fs::remove_dir_all(dir);
    std::fs::create_dir_all(dir).unwrap();
    let path = format!("{dir}/archive.jar");
    let f = File::create(&path).unwrap();
    let mut zip = zip::ZipWriter::new(f);
    zip.start_file("META-INF/MANIFEST.MF", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"Manifest-Version: 1.0\n").unwrap();
    zip.finish().unwrap();

    assert_eq!(detect(std::path::Path::new(&path)).unwrap(), OfficeKind::None);
    let _ = std::fs::remove_dir_all(dir);
}
