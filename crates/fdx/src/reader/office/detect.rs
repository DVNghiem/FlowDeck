//! Magic-byte + content-type sniff to identify .docx and .xlsx files.

use std::fs;
use std::io::Read;
use std::path::Path;

const ZIP_MAGIC: [u8; 4] = [0x50, 0x4B, 0x03, 0x04];

/// What kind of Office file (if any) a path looks like.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfficeKind {
    Docx,
    Xlsx,
    None,
}

/// Detect an Office file by reading the first 4 bytes and inspecting
/// `[Content_Types].xml`. Returns `OfficeKind::None` for non-OOXML zips.
pub fn detect(path: &Path) -> anyhow::Result<OfficeKind> {
    let mut file = fs::File::open(path)?;
    let mut head = [0u8; 4];
    file.read_exact(&mut head)?;
    if head != ZIP_MAGIC {
        return Ok(OfficeKind::None);
    }

    let file = fs::File::open(path)?;
    let mut zip = match zip::ZipArchive::new(file) {
        Ok(z) => z,
        Err(_) => return Ok(OfficeKind::None),
    };
    let mut ct = String::new();
    let Ok(mut entry) = zip.by_name("[Content_Types].xml") else {
        return Ok(OfficeKind::None);
    };
    entry.read_to_string(&mut ct)?;

    if ct.contains("wordprocessingml") {
        Ok(OfficeKind::Docx)
    } else if ct.contains("spreadsheetml") {
        Ok(OfficeKind::Xlsx)
    } else {
        Ok(OfficeKind::None)
    }
}
