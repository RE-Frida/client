use std::fs;
use std::path::Path;

fn main() {
    let cert_dir = Path::new("../certs");
    let cert_path = cert_dir.join("server_cert.pem");
    let key_path = cert_dir.join("server_key.pem");
    let pin_path = cert_dir.join("spki_pin.txt");

    // Panic if certs folder doesn't exist
    assert!(
        cert_path.exists(),
        "Certs not found at {}. Run ./generate-certs.sh first!",
        cert_dir.display()
    );
    assert!(
        key_path.exists(),
        "Key not found at {}. Run ./generate-certs.sh first!",
        cert_dir.display()
    );
    assert!(
        pin_path.exists(),
        "SPKI pin not found at {}. Run ./generate-certs.sh first!",
        pin_path.display()
    );

    // Copy certs to src-tauri for embedding
    fs::copy(&cert_path, "embedded_cert.pem").expect("Failed to copy cert");
    fs::copy(&key_path, "embedded_key.pem").expect("Failed to copy key");
    fs::copy(&pin_path, "spki_pin.txt").expect("Failed to copy pin");

    println!("cargo:warning=Certs embedded from {}", cert_dir.display());
    println!("cargo:rerun-if-changed={}", cert_path.display());
    println!("cargo:rerun-if-changed={}", key_path.display());
    println!("cargo:rerun-if-changed={}", pin_path.display());
    println!("cargo:rerun-if-changed=build.rs");

    tauri_build::build();
}
