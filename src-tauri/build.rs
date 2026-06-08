use std::fs;
use std::path::Path;

fn main() {
    let cert_dir = Path::new("../certs");
    let cert_path = cert_dir.join("server_cert.pem");
    let key_path = cert_dir.join("server_key.pem");
    let pin_path = cert_dir.join("spki_pin.txt");

    assert!(
        cert_path.exists(),
        "Certs not found. Run ./generate-certs.sh first!"
    );

    // Copy certs to src-tauri for embedding
    fs::copy(&cert_path, "embedded_cert.pem").expect("Failed to copy cert");
    fs::copy(&key_path, "embedded_key.pem").expect("Failed to copy key");
    fs::copy(&pin_path, "spki_pin.txt").expect("Failed to copy pin");

    println!("cargo:rerun-if-changed={}", cert_path.display());
    println!("cargo:rerun-if-changed={}", key_path.display());
    println!("cargo:rerun-if-changed=build.rs");

    tauri_build::build();
}
