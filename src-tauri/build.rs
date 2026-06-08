use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    // Generate TLS certs and SPKI pin if missing
    let cert_dir = Path::new("../certs");
    let cert_path = cert_dir.join("server_cert.pem");
    let key_path = cert_dir.join("server_key.pem");
    let pin_path = Path::new("spki_pin.txt");

    if !cert_path.exists() || !key_path.exists() {
        println!("cargo:warning=Generating self-signed TLS certificate...");
        fs::create_dir_all(cert_dir).expect("Failed to create certs directory");

        let output = Command::new("openssl")
            .args([
                "req", "-x509", "-newkey", "ec",
                "-pkeyopt", "ec_paramgen_curve:prime256v1",
                "-keyout", key_path.to_str().unwrap(),
                "-out", cert_path.to_str().unwrap(),
                "-days", "3650", "-nodes",
                "-subj", "/CN=refrida.local",
                "-addext", "subjectAltName=IP:10.1.3.22,DNS:localhost",
            ])
            .output()
            .expect("Failed to run openssl (is it installed?)");

        if !output.status.success() {
            panic!(
                "openssl failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        println!("cargo:warning=Certificate generated at {}", cert_path.display());
    }

    // Extract SPKI pin from cert
    if !pin_path.exists() || cert_path.metadata().unwrap().modified().unwrap()
        > pin_path.metadata().unwrap().modified().unwrap()
    {
        println!("cargo:warning=Extracting SPKI pin from certificate...");

        // openssl x509 -in cert.pem -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64
        let pubkey = Command::new("openssl")
            .args(["x509", "-in", cert_path.to_str().unwrap(), "-pubkey", "-noout"])
            .output()
            .expect("Failed to extract public key");

        assert!(pubkey.status.success(), "Failed to extract public key");

        let der = Command::new("openssl")
            .args(["pkey", "-pubin", "-outform", "DER"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child.stdin.as_mut().unwrap().write_all(&pubkey.stdout)?;
                child.wait_with_output()
            })
            .expect("Failed to convert to DER");

        assert!(der.status.success(), "Failed to convert to DER");

        let hash = Command::new("openssl")
            .args(["dgst", "-sha256", "-binary"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child.stdin.as_mut().unwrap().write_all(&der.stdout)?;
                child.wait_with_output()
            })
            .expect("Failed to hash");

        assert!(hash.status.success(), "Failed to hash");

        let b64 = Command::new("openssl")
            .args(["base64", "-A"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child.stdin.as_mut().unwrap().write_all(&hash.stdout)?;
                child.wait_with_output()
            })
            .expect("Failed to base64 encode");

        assert!(b64.status.success(), "Failed to base64 encode");

        let pin = format!(
            "sha256/{}",
            String::from_utf8_lossy(&b64.stdout).trim()
        );

        fs::write(pin_path, &pin).expect("Failed to write SPKI pin");
        println!("cargo:warning=SPKI pin: {}", pin);
    }

    // Tell cargo to rerun if cert or pin changes
    println!("cargo:rerun-if-changed={}", cert_path.display());
    println!("cargo:rerun-if-changed={}", pin_path.display());
    println!("cargo:rerun-if-changed=build.rs");

    tauri_build::build();
}
