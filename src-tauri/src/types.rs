use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub model: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub frida_port: u16,
    pub custom_package: String,
    pub advanced_mode: bool,
    #[serde(default)]
    pub auth_token: Option<String>,
    #[serde(default)]
    pub auth_username: Option<String>,
    #[serde(default)]
    pub auth_avatar_url: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            frida_port: 27042,
            custom_package: "com.target.app".to_string(),
            advanced_mode: false,
            auth_token: None,
            auth_username: None,
            auth_avatar_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub authenticated: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub token: Option<String>,
}
