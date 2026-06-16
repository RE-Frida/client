export interface DeviceInfo {
  id: string;
  model: string | null;
  status: string;
}

export interface AppConfig {
  settings: AppSettings;
  auth: ConfigAuth;
}

export interface AppSettings {
  theme: string;
  frida_port: number;
  custom_package: string;
  advanced_mode: boolean;
  accent_color?: string;
  gadget_name?: string;
}

export interface ConfigAuth {
  token?: string;
}

export interface ScriptData {
  id: string;
  name: string;
  description: string;
  author: string;
  code: string;
  downloads: number;
  upvotes: number;
  downvotes: number;
  user_vote: boolean | null;
  category: string;
  game: string;
  game_version: string;
  tags: string[];
  created_at: string;
}

export interface ProjectData {
  id: string;
  name: string;
  description: string;
  icon: string;
  author: string;
  author_discord_id: string;
  category: string;
  tags: string[];
  game_version: string;
  downloads: number;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  authenticated: boolean;
  username: string | null;
  avatar_url: string | null;
  token: string | null;
  discord_id: string | null;
  linked_since: string | null;
}

export interface TagCategory {
  id: string;
  label: string;
  description: string;
}

export interface TagGame {
  id: string;
  label: string;
}

export interface TagVersion {
  id: string;
  label: string;
}

export interface TagsData {
  categories: TagCategory[];
  games: TagGame[];
  game_versions: TagVersion[];
}

export type TabId = "dashboard" | "injection" | "adb" | "marketplace" | "logs" | "settings";
