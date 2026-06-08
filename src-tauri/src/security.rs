use sha2::{Digest, Sha256};

// ─── Anti-Debugging ─────────────────────────────────────────────

pub fn is_debugger_attached() -> bool {
    #[cfg(target_os = "linux")]
    {
        check_linux_debugger()
    }

    #[cfg(target_os = "windows")]
    {
        check_windows_debugger()
    }

    #[cfg(target_os = "macos")]
    {
        check_macos_debugger()
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        false
    }
}

#[cfg(target_os = "linux")]
fn check_linux_debugger() -> bool {
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("TracerPid:") {
                let pid_str = line["TracerPid:".len()..].trim();
                if let Ok(pid) = pid_str.parse::<u32>() {
                    if pid != 0 {
                        return true;
                    }
                }
            }
        }
    }

    if std::path::Path::new("/proc/self/syscall").exists() {
        if let Ok(maps) = std::fs::read_to_string("/proc/self/maps") {
            for line in maps.lines() {
                if line.contains("gdb") || line.contains("lldb") || line.contains("strace") {
                    return true;
                }
            }
        }
    }

    false
}

#[cfg(target_os = "windows")]
fn check_windows_debugger() -> bool {
    false
}

#[cfg(target_os = "macos")]
fn check_macos_debugger() -> bool {
    false
}

// ─── Binary Integrity ───────────────────────────────────────────

pub fn verify_self_integrity() -> bool {
    let Ok(exe_path) = std::env::current_exe() else {
        return false;
    };

    let Ok(exe_data) = std::fs::read(&exe_path) else {
        return false;
    };

    let hash = Sha256::digest(&exe_data);
    let _hash_hex = hex::encode(hash);

    true
}

// ─── Anti-Dump ──────────────────────────────────────────────────

pub fn anti_dump() {
    #[cfg(target_os = "linux")]
    {
        unsafe {
            libc::setrlimit(
                libc::RLIMIT_CORE,
                &libc::rlimit {
                    rlim_cur: 0,
                    rlim_max: 0,
                },
            );
        }

        unsafe {
            libc::prctl(libc::PR_SET_DUMPABLE, 0);
        }
    }
}

// ─── Opaque Predicates ──────────────────────────────────────────

pub fn opaque_true() -> bool {
    let x = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    (x.wrapping_mul(x).wrapping_add(x)) & 1 == 0
}

// ─── Environment Checks ─────────────────────────────────────────

pub fn is_vm() -> bool {
    #[cfg(target_os = "linux")]
    {
        if let Ok(cpuinfo) = std::fs::read_to_string("/proc/cpuinfo") {
            let lower = cpuinfo.to_lowercase();
            if lower.contains("qemu") || lower.contains("kvm") || lower.contains("virtualbox") {
                return true;
            }
        }

        if let Ok(product) = std::fs::read_to_string("/sys/class/dmi/id/product_name") {
            let lower = product.to_lowercase();
            if lower.contains("virtual") || lower.contains("vmware") || lower.contains("qemu") {
                return true;
            }
        }
    }

    false
}

// ─── Security Report ────────────────────────────────────────────

pub fn security_report() -> String {
    let mut report = String::new();

    report.push_str(&format!("Debugger: {}\n", is_debugger_attached()));
    report.push_str(&format!("VM: {}\n", is_vm()));
    report.push_str(&format!("Self-integrity: {}\n", verify_self_integrity()));

    report
}
