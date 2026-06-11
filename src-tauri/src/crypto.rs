use sha2::Sha256;
use zeroize::{Zeroize, ZeroizeOnDrop};

// ─── Types ──────────────────────────────────────────────────────

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct CryptoKey {
    key: [u8; 32],
}

impl CryptoKey {
    pub fn new() -> Self {
        let mut key = [0u8; 32];
        let runtime_seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes();

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

// ─── HMAC Signing ───────────────────────────────────────────────

pub fn hmac_sign(key: &[u8], message: &[u8]) -> Vec<u8> {
    use hmac::{Hmac, Mac};
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key)
        .expect("HMAC key must be valid length");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

pub fn hmac_verify(key: &[u8], message: &[u8], base64_sig: &str) -> bool {
    use hmac::{Hmac, Mac};
    use base64::Engine;
    let Ok(signature) = base64::engine::general_purpose::STANDARD.decode(base64_sig) else {
        return false;
    };
    let mut mac = match <Hmac<Sha256> as Mac>::new_from_slice(key) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(message);
    mac.verify_slice(&signature).is_ok()
}

// ─── Base64 ─────────────────────────────────────────────────────

pub fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}
