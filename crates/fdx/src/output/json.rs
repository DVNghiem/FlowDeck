use crate::reader::code::CodeResult;
use crate::reader::text::TextResult;
use serde_json;
use std::io::{self, Write};

pub fn print_json_output(writer: &mut dyn Write, result: &CodeResult) -> io::Result<()> {
    let json = serde_json::to_string_pretty(result).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}

pub fn print_json_text_result(writer: &mut dyn Write, result: &TextResult) -> io::Result<()> {
    let json = serde_json::to_string_pretty(result).map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("JSON serialization error: {}", e))
    })?;
    writeln!(writer, "{}", json)?;
    Ok(())
}
