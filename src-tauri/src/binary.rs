pub fn find_binary(name: &str) -> String {
    #[cfg(target_os = "windows")]
    let ext = ".exe";
    #[cfg(not(target_os = "windows"))]
    let ext = "";

    let suffix = if cfg!(target_os = "windows") {
        "-x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "linux") {
        "-x86_64-unknown-linux-gnu"
    } else if cfg!(target_os = "macos") {
        "-x86_64-apple-darwin"
    } else {
        ""
    };

    let name_with_suffix = format!("{}{}{}", name, suffix, ext);
    let name_plain = format!("{}{}", name, ext);

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join("tools").join(&name_with_suffix);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            let bundled = dir.join(&name_with_suffix);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            let bundled = dir.join("tools").join(&name_plain);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
            let bundled = dir.join(&name_plain);
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
            }
        }
    }
    let cwd = std::path::PathBuf::from("tools").join(&name_plain);
    if cwd.exists() {
        return cwd.to_string_lossy().to_string();
    }
    // Try resolving via shell (handles pip --user installs, etc.)
    if let Ok(out) = std::process::Command::new("which").arg(name).output() {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }
    name_plain
}
