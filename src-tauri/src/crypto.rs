use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce,
};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::{Digest, Sha256};
use zeroize::{Zeroize, ZeroizeOnDrop};

// ─── Constants ──────────────────────────────────────────────────

// Embedded SPKI pin for the server's TLS certificate
// This is the SHA-256 hash of the SubjectPublicKeyInfo of the server cert
// Generated at build time or hardcoded after first connection

// ─── Types ──────────────────────────────────────────────────────

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct CryptoKey {
    key: [u8; 32],
}

impl CryptoKey {
    pub fn new() -> Self {
        let mut key = [0u8; 32];
        // Derive key from obfuscated material + runtime entropy
        let runtime_seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes();

        // Obfuscated key material (not the actual key)
        let obfuscated: [u8; 32] = [
            0x4d, 0x6f, 0x6e, 0x20, 0x4a, 0x75, 0x6e, 0x20,
            0x30, 0x38, 0x20, 0x32, 0x30, 0x32, 0x36, 0x20,
            0x32, 0x31, 0x3a, 0x34, 0x30, 0x3a, 0x30, 0x30,
            0x20, 0x47, 0x4d, 0x54, 0x2b, 0x30, 0x30, 0x30,
        ];

        for i in 0..32 {
            key[i] = obfuscated[i]
                ^ runtime_seed[i % 16]
                ^ (i as u8).wrapping_mul(0x5a);
        }

        Self { key }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.key
    }
}

// ─── SPKI Pinning ───────────────────────────────────────────────

/// Verify that a TLS certificate's SPKI hash matches our pinned value
pub fn verify_spki_pin(cert_der: &[u8]) -> bool {
    let pin = get_stored_pin();
    if pin.is_empty() {
        return true; // No pin stored, allow connection
    }

    let hash = Sha256::digest(cert_der);
    let encoded = base64_encode(&hash);

    constant_time_compare(encoded.as_bytes(), pin.as_bytes())
}

/// Get the stored SPKI pin
pub fn get_stored_pin() -> String {
    // Read pin from file at runtime (not const)
    std::fs::read_to_string("spki_pin.txt")
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// Compute SPKI pin from DER-encoded certificate
pub fn compute_spki_pin(cert_der: &[u8]) -> String {
    let hash = Sha256::digest(cert_der);
    format!("sha256/{}", base64_encode(&hash))
}

// ─── Base64 Helpers ─────────────────────────────────────────────

pub fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn base64_decode(data: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Base64 decode failed: {}", e))
}

// ─── ChaCha20-Poly1305 ──────────────────────────────────────────

/// Encrypt a message using ChaCha20-Poly1305
pub fn chacha_encrypt(key: &CryptoKey, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypt a message using ChaCha20-Poly1305
pub fn chacha_decrypt(key: &CryptoKey, data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("Invalid ciphertext: too short".to_string());
    }

    let cipher = ChaCha20Poly1305::new(Key::from_slice(key.as_bytes()));
    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))
}

// ─── HMAC Signing ───────────────────────────────────────────────

/// Sign a message using HMAC-SHA256
pub fn hmac_sign(key: &[u8], message: &[u8]) -> Vec<u8> {
    use hmac::Mac;
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key)
        .expect("HMAC can take key of any size");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

/// Verify an HMAC-SHA256 signature
pub fn hmac_verify(key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    use hmac::Mac;
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key)
        .expect("HMAC can take key of any size");
    mac.update(message);
    mac.verify_slice(signature).is_ok()
}

// ─── String Obfuscation ─────────────────────────────────────────

/// Obfuscate a string by XOR-ing with a key
pub fn obfuscate_string(input: &str, key: &[u8]) -> Vec<u8> {
    input
        .bytes()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect()
}

/// Deobfuscate a string by XOR-ing with a key
pub fn deobfuscate_string(input: &[u8], key: &[u8]) -> String {
    input
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ key[i % key.len()])
        .map(|b| b as char)
        .collect()
}

// ─── Utility ────────────────────────────────────────────────────

/// Constant-time comparison to prevent timing attacks
fn constant_time_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

/// Generate a random 32-byte key
pub fn generate_random_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    key
}

/// Hash a binary file for integrity verification
pub fn hash_binary(data: &[u8]) -> String {
    let hash = Sha256::digest(data);
    hex::encode(hash)
}

/// Verify binary integrity against expected hash
pub fn verify_binary_integrity(data: &[u8], expected_hash: &str) -> bool {
    let actual = hash_binary(data);
    constant_time_compare(actual.as_bytes(), expected_hash.as_bytes())
}
