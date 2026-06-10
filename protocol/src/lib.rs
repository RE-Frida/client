use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── Envelope ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    Request(Request),
    Response(Response),
    Event(ServerEvent),
    Auth(AuthFrame),
    Ping,
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: String,
    pub action: Action,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthFrame {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discord_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discord_redirect_uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    // ── Auth ──
    AuthLogin,
    AuthRefresh,
    AuthVerify,
    AuthLogout,
    GetConfig,
    GetGuidelines,

    // ── Scripts (legacy) ──
    ListScripts,
    GetScript,
    SubmitScript,
    DownloadScript,
    GetTags,
    VoteScript,

    // ── Projects ──
    ListProjects,
    GetProject,
    CreateProject,
    UpdateProject,
    DeleteProject,
    GetProjectFile,
    UpdateProjectFile,
    ListProjectFiles,

    // ── Internal ──
    ServerShutdown,

    // ── Client Info ──
    ClientInfo,
}

impl Request {
    pub fn new(action: Action) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            action,
            data: None,
            token: None,
        }
    }
}

impl Response {
    pub fn ok(id: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            id: id.into(),
            ok: true,
            error: None,
            data: Some(data),
        }
    }

    pub fn err(id: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            ok: false,
            error: Some(error.into()),
            data: None,
        }
    }
}

// ─── Server Events (push) ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ServerEvent {
    ScriptPublished {
        script_id: String,
        name: String,
        author: String,
    },
    ScriptRemoved {
        script_id: String,
    },
    ServerMessage {
        message: String,
        level: String,
    },
}

// ─── Payloads ────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListScriptsQuery {
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub game: String,
    #[serde(default)]
    pub game_version: String,
    #[serde(default)]
    pub sort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptData {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub code: String,
    pub downloads: u64,
    pub upvotes: i64,
    pub downvotes: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_vote: Option<bool>,
    pub category: String,
    pub game: String,
    pub game_version: String,
    pub tags: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VotePayload {
    pub script_id: String,
    pub upvote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitScriptPayload {
    pub name: String,
    pub description: String,
    pub code: String,
    pub author: String,
    pub category: String,
    pub game: String,
    pub game_version: String,
    pub tags: Vec<String>,
    pub guidelines_accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResult {
    pub token: Option<String>,
    pub user: Option<UserInfo>,
    pub is_guild_member: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfigData {
    pub discord: DiscordConfig,
    pub server: ServerInfo,
    pub oauth: OAuthConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordConfig {
    pub client_id: String,
    pub guild_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimum_client_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthConfig {
    pub redirect_uri: String,
    pub auth_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuidelinesData {
    pub guidelines: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagCategory {
    pub id: String,
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagGame {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagVersion {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagsData {
    pub categories: Vec<TagCategory>,
    pub games: Vec<TagGame>,
    pub game_versions: Vec<TagVersion>,
}

// ─── Projects ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectData {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub author: String,
    pub author_discord_id: String,
    pub category: String,
    pub tags: Vec<String>,
    pub downloads: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectPayload {
    pub name: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProjectPayload {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFilePayload {
    pub project_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListFilesPayload {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetFilePayload {
    pub project_id: String,
    pub path: String,
}
