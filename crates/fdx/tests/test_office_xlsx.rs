use std::fs::File;
use std::io::Write;

use fdx::reader::office::xlsx::parse_xlsx;
use zip::write::SimpleFileOptions;

#[test]
fn xlsx_with_one_sheet_renders_markdown() {
    let dir = format!(
        "/tmp/fdx_office_xlsx/{}",
        "xlsx_with_one_sheet_renders_markdown"
    );
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = format!("{dir}/data.xlsx");

    let content_types = r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/xl/workbook.xml"
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"#;
    let root_rels = r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#;
    let workbook_rels = r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"#;
    let workbook = r#"<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets>
</workbook>"#;
    let sheet = r#"<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c>
              <c r="B1" t="inlineStr"><is><t>Qty</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Widget</t></is></c>
              <c r="B2"><v>3</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Sprocket</t></is></c>
              <c r="B3"><v>7</v></c></row>
  </sheetData>
</worksheet>"#;

    let f = File::create(&path).unwrap();
    let mut zip = zip::ZipWriter::new(f);
    zip.start_file("[Content_Types].xml", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(content_types.as_bytes()).unwrap();
    zip.start_file("_rels/.rels", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(root_rels.as_bytes()).unwrap();
    zip.start_file("xl/workbook.xml", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(workbook.as_bytes()).unwrap();
    zip.start_file("xl/_rels/workbook.xml.rels", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(workbook_rels.as_bytes()).unwrap();
    zip.start_file("xl/worksheets/sheet1.xml", SimpleFileOptions::default())
        .unwrap();
    zip.write_all(sheet.as_bytes()).unwrap();
    zip.finish().unwrap();

    let mut warnings = Vec::new();
    let md = parse_xlsx(std::path::Path::new(&path), &mut warnings).unwrap();

    assert!(md.contains("## Sheet: Sales"), "got: {md}");
    assert!(md.contains("| Item | Qty |"), "got: {md}");
    assert!(md.contains("Widget"), "got: {md}");
    assert!(md.contains("| 3 |") || md.contains("| 3 |"), "got: {md}");
    assert!(md.contains("Sprocket"), "got: {md}");
    assert!(warnings.is_empty(), "warnings: {warnings:?}");

    let _ = std::fs::remove_dir_all(&dir);
}