use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub model: Option<String>,
    pub status: String,
}

use crate::config::DEFAULT_PACKAGE;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub settings: AppSettings,
    #[serde(default)]
    pub auth: ConfigAuth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub frida_port: u16,
    pub custom_package: String,
    pub advanced_mode: bool,
    #[serde(default)]
    pub accent_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigAuth {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            settings: AppSettings::default(),
            auth: ConfigAuth::default(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            frida_port: 27042,
            custom_package: DEFAULT_PACKAGE.to_string(),
            advanced_mode: false,
            accent_color: None,
        }
    }
}

impl Default for ConfigAuth {
    fn default() -> Self {
        Self { token: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub authenticated: bool,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub token: Option<String>,
}
