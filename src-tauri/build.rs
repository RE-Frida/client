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

    // Embed WebView2Loader.dll for single-file Windows distribution
    let dll_path = Path::new("WebView2Loader.dll");
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let embedded_path = Path::new(&out_dir).join("webview2_embedded.rs");

    if dll_path.exists() {
        let bytes = fs::read(dll_path).expect("Failed to read WebView2Loader.dll");
        let mut code = String::from("pub const WEBVIEW2_LOADER_DLL: &[u8] = &[\n");
        for chunk in bytes.chunks(16) {
            code.push_str("    ");
            for (j, byte) in chunk.iter().enumerate() {
                if j > 0 { code.push_str(", "); }
                code.push_str(&format!("0x{:02x}", byte));
            }
            code.push_str(",\n");
        }
        code.push_str("];\n");
        fs::write(&embedded_path, code).expect("Failed to write embedded dll");
        println!("cargo:rerun-if-changed=WebView2Loader.dll");
    } else {
        fs::write(&embedded_path, "pub const WEBVIEW2_LOADER_DLL: &[u8] = &[];\n")
            .expect("Failed to write stub");
    }

    tauri_build::build();
}
