// Types for authentication
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  profile_picture?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    user: User;
    token: string;
  };
  errors?: any[];
}

export interface GameServerInfo {
  uuid: string;
  name: string;
  description?: string;
  websocket_url: string;
  max_players: number;
  current_players: number;
  is_online: boolean;
  version: string;
  tags: string;
  created_at: string;
}

export interface ServersResponse {
  success: boolean;
  message?: string;
  data?: {
    servers: GameServerInfo[];
  };
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
