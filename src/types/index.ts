export interface DeviceInfo {
  id: string;
  model: string | null;
  status: string;
}

export interface AppConfig {
  theme: string;
  server_url: string;
  frida_port: number;
  custom_package: string;
  advanced_mode: boolean;
}

export interface ScriptItem {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  downloads: number;
  upvotes: number;
  downvotes: number;
  user_vote: boolean | null;
  code: string;
}

export interface AuthState {
  authenticated: boolean;
  username: string | null;
  avatar_url: string | null;
  token: string | null;
}

export type TabId = "dashboard" | "marketplace" | "editor" | "logs" | "settings";
