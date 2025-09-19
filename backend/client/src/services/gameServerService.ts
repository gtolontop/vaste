const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8080";

export interface GameServer {
  id: number;
  uuid: string;
  name: string;
  description: string;
  host: string;
  port: number;
  websocket_url: string;
  max_players: number;
  current_players: number;
  is_online: boolean;
  is_public: boolean;
  owner_id: number;
  version: string;
  tags: string;
  license_key?: string;
  license_expires_at: string;
  is_license_active: boolean;
  created_at: string;
  updated_at: string;
  last_ping?: string;
}

export interface CreateServerData {
  name: string;
  description?: string;
  host: string;
  port: number;
  websocket_url: string;
  max_players: number;
  is_public?: boolean;
  version?: string;
  tags?: string;
}

// Helper function to make authenticated requests
async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem("vaste_token");

  const config: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${BACKEND_URL}/api${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Network error" }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const gameServerService = {
  // Get all public servers
  async getPublicServers(): Promise<GameServer[]> {
    return await apiRequest("/game-servers/public");
  },

  // Get user's servers
  async getMyServers(): Promise<GameServer[]> {
    return await apiRequest("/game-servers/my-servers");
  },

  // Create new server
  async createServer(data: CreateServerData): Promise<{ server: GameServer; message: string }> {
    return await apiRequest("/game-servers/create", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Get server details (with license key for owner)
  async getServer(uuid: string): Promise<GameServer> {
    return await apiRequest(`/game-servers/${uuid}`);
  },

  // Update server
  async updateServer(uuid: string, data: Partial<CreateServerData>): Promise<{ server: GameServer; message: string }> {
    return await apiRequest(`/game-servers/${uuid}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // Delete server
  async deleteServer(uuid: string): Promise<{ message: string }> {
    return await apiRequest(`/game-servers/${uuid}`, {
      method: "DELETE",
    });
  },

  // Renew license
  async renewLicense(uuid: string): Promise<{ server: GameServer; message: string }> {
    return await apiRequest(`/game-servers/${uuid}/renew-license`, {
      method: "POST",
    });
  },

  // Deactivate license
  async deactivateLicense(uuid: string): Promise<{ message: string }> {
    return await apiRequest(`/game-servers/${uuid}/deactivate-license`, {
      method: "POST",
    });
  },

  // Reactivate license
  async reactivateLicense(uuid: string): Promise<{ message: string }> {
    return await apiRequest(`/game-servers/${uuid}/reactivate-license`, {
      method: "POST",
    });
  },
};
