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
        .expect("HMAC can take key of any size");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

// ─── Base64 ─────────────────────────────────────────────────────

pub fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}
