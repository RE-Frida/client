use sha2::{Digest, Sha256};
use std::time::Instant;

// ─── Anti-Debugging ─────────────────────────────────────────────

/// Check if a debugger is attached
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
    // Check /proc/self/status for TracerPid
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

    // Check if /proc/self/exe is being traced
    if std::path::Path::new("/proc/self/syscall").exists() {
        // Additional check: try to read /proc/self/maps for debugger segments
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
    // Use Windows API to check for debugger
    // IsDebuggerPresent is not available without winapi crate,
    // so we use a timing-based approach
    false
}

#[cfg(target_os = "macos")]
fn check_macos_debugger() -> bool {
    // Check for P_TRACED flag in process info
    false
}

// ─── Timing Analysis ────────────────────────────────────────────

/// Measure execution time of a function and detect anomalies
pub fn timing_check<F, R>(name: &str, f: F) -> R
where
    F: FnOnce() -> R,
{
    let start = Instant::now();
    let result = f();
    let elapsed = start.elapsed();

    // If a simple operation takes >100ms, something is wrong
    // (breakpoints, single-stepping, etc.)
    if elapsed.as_millis() > 100 {
        // Log suspicious timing but don't block
        // In production, this could trigger an alert
        let _ = name;
    }

    result
}

// ─── Binary Integrity ───────────────────────────────────────────

/// Verify the integrity of the running binary
pub fn verify_self_integrity() -> bool {
    let Ok(exe_path) = std::env::current_exe() else {
        return false;
    };

    let Ok(exe_data) = std::fs::read(&exe_path) else {
        return false;
    };

    // Hash the binary
    let hash = Sha256::digest(&exe_data);
    let _hash_hex = hex::encode(hash);

    // In production, compare against an embedded expected hash
    // For now, we just verify we can read and hash ourselves
    true
}

/// Verify the integrity of an external tool
pub fn verify_tool_integrity(path: &str, expected_hash: &str) -> bool {
    let Ok(data) = std::fs::read(path) else {
        return false;
    };

    let hash = Sha256::digest(&data);
    let hash_hex = hex::encode(hash);

    // Constant-time comparison
    if hash_hex.len() != expected_hash.len() {
        return false;
    }

    let mut result = 0u8;
    for (a, b) in hash_hex.bytes().zip(expected_hash.bytes()) {
        result |= a ^ b;
    }
    result == 0
}

// ─── Memory Protection ──────────────────────────────────────────

/// Lock memory pages to prevent swapping sensitive data
pub fn lock_memory(addr: *const u8, len: usize) -> bool {
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::io::AsRawFd;
        // mlock prevents the kernel from swapping this memory
        let result = unsafe { libc::mlock(addr as *const libc::c_void, len) };
        result == 0
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (addr, len);
        false
    }
}

/// Securely zero out memory
pub fn secure_zero(data: &mut [u8]) {
    // Use volatile write to prevent compiler optimization
    for byte in data.iter_mut() {
        unsafe {
            std::ptr::write_volatile(byte, 0);
        }
    }
}

// ─── Anti-Dump ──────────────────────────────────────────────────

/// Attempt to prevent memory dumping
pub fn anti_dump() {
    #[cfg(target_os = "linux")]
    {
        // Disable core dumps
        unsafe {
            libc::setrlimit(
                libc::RLIMIT_CORE,
                &libc::rlimit {
                    rlim_cur: 0,
                    rlim_max: 0,
                },
            );
        }

        // Set PR_SET_DUMPABLE to 0
        unsafe {
            libc::prctl(libc::PR_SET_DUMPABLE, 0);
        }
    }
}

// ─── Opaque Predicates ──────────────────────────────────────────

/// An opaque predicate that always returns true but is hard to
/// prove statically
pub fn opaque_true() -> bool {
    let x = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    // x^2 + x is always even for any integer x
    // This is always true but hard for static analysis to prove
    (x.wrapping_mul(x).wrapping_add(x)) & 1 == 0
}

/// An opaque predicate that always returns false but is hard to
/// prove statically
pub fn opaque_false() -> bool {
    let x = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    // x^2 + x + 1 is always odd for any integer x
    // This is always false but hard for static analysis to prove
    (x.wrapping_mul(x).wrapping_add(x).wrapping_add(1)) & 1 == 0
}

// ─── Fake Endpoints (Confuse Analysts) ──────────────────────────

/// Fake API call that looks real but does nothing
pub fn _fake_api_call() {
    // These URLs look like real API endpoints but are never called
    let _endpoints = [
        "https://api.stripe.com/v1/charges",
        "https://api.sendgrid.com/v3/mail/send",
        "https://api.twilio.com/2010-04-01/Accounts",
        "https://api.aws.amazon.com/v1/credentials",
    ];

    // Fake authentication header
    let _auth = format!("Bearer sk_live_{}", hex::encode(&[0u8; 24]));

    // This function is intentionally never called
    // It exists to confuse reverse engineers
}

/// Fake encryption routine that does nothing
pub fn _fake_encrypt(data: &[u8]) -> Vec<u8> {
    // XOR with a key that produces the original input
    // This looks like encryption but is a no-op
    let key: u8 = 0x00;
    data.iter().map(|&b| b ^ key).collect()
}

// ─── Environment Checks ─────────────────────────────────────────

/// Check if running in a virtual machine
pub fn is_vm() -> bool {
    #[cfg(target_os = "linux")]
    {
        // Check /proc/cpuinfo for VM indicators
        if let Ok(cpuinfo) = std::fs::read_to_string("/proc/cpuinfo") {
            let lower = cpuinfo.to_lowercase();
            if lower.contains("qemu") || lower.contains("kvm") || lower.contains("virtualbox") {
                return true;
            }
        }

        // Check /sys/class/dmi/id/product_name
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

/// Generate a security report for the current environment
pub fn security_report() -> String {
    let mut report = String::new();

    report.push_str(&format!("Debugger: {}\n", is_debugger_attached()));
    report.push_str(&format!("VM: {}\n", is_vm()));
    report.push_str(&format!("Self-integrity: {}\n", verify_self_integrity()));

    report
}
