use std::io::{self, Write};

pub fn info(msg: &str) {
    write_line("INFO", msg, false);
}

pub fn warn(msg: &str) {
    write_line("WARN", msg, false);
}

pub fn error(msg: &str) {
    write_line("ERROR", msg, true);
}

fn write_line(level: &str, msg: &str, to_stderr: bool) {
    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let formatted = format!("{timestamp} [{level}] {msg}");

    if to_stderr {
        let _ = writeln!(io::stderr(), "{formatted}");
    } else {
        let _ = writeln!(io::stdout(), "{formatted}");
    }
}
