import { LoginCredentials, RegisterCredentials, AuthResponse, User, ServersResponse } from "./auth.types";

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8080";

class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Local token storage
  private getToken(): string | null {
    return localStorage.getItem("vaste_token");
  }

  private setToken(token: string): void {
    localStorage.setItem("vaste_token", token);
  }

  private removeToken(): void {
    localStorage.removeItem("vaste_token");
  }

  // Local user storage
  private getStoredUser(): User | null {
    const userData = localStorage.getItem("vaste_user");
    return userData ? JSON.parse(userData) : null;
  }

  private setStoredUser(user: User): void {
    localStorage.setItem("vaste_user", JSON.stringify(user));
  }

  private removeStoredUser(): void {
    localStorage.removeItem("vaste_user");
  }

  // Get headers with authentication
  private getAuthHeaders(): HeadersInit {
    const token = this.getToken();
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  // Registration
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data: AuthResponse = await response.json();

      if (data.success && data.data) {
        this.setToken(data.data.token);
        this.setStoredUser(data.data.user);
      }

      return data;
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      return {
        success: false,
        message: "Server connection error",
      };
    }
  }

  // Login
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const data: AuthResponse = await response.json();

      if (data.success && data.data) {
        this.setToken(data.data.token);
        this.setStoredUser(data.data.user);
      }

      return data;
    } catch (error) {
      console.error("[AUTH] Login error:", error);
      return {
        success: false,
        message: "Server connection error",
      };
    }
  }

  // Logout
  async logout(): Promise<void> {
    try {
      // Optional API logout call
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: "POST",
        headers: this.getAuthHeaders(),
      });
    } catch (error) {
      console.error("[AUTH] Logout error:", error);
    } finally {
      // Local cleanup
      this.removeToken();
      this.removeStoredUser();
    }
  }

  // Token verification
  async verifyToken(): Promise<User | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/verify`, {
        headers: this.getAuthHeaders(),
      });

      const data: AuthResponse = await response.json();

      if (data.success && data.data) {
        this.setStoredUser(data.data.user);
        return data.data.user;
      } else {
        // Invalid token, cleanup
        this.removeToken();
        this.removeStoredUser();
        return null;
      }
    } catch (error) {
      console.error("[AUTH] Token verification error:", error);
      this.removeToken();
      this.removeStoredUser();
      return null;
    }
  }

  // Get profile
  async getProfile(): Promise<User | null> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        headers: this.getAuthHeaders(),
      });

      const data: AuthResponse = await response.json();

      if (data.success && data.data) {
        this.setStoredUser(data.data.user);
        return data.data.user;
      }

      return null;
    } catch (error) {
      console.error("[AUTH] Profile retrieval error:", error);
      return null;
    }
  }

  // Profile update
  async updateProfile(userData: Partial<Pick<User, "username" | "email">>): Promise<AuthResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      const data: AuthResponse = await response.json();

      if (data.success && data.data) {
        this.setStoredUser(data.data.user);
      }

      return data;
    } catch (error) {
      console.error("[AUTH] Profile update error:", error);
      return {
        success: false,
        message: "Server connection error",
      };
    }
  }

  // Password change
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/password`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      return await response.json();
    } catch (error) {
      console.error("[AUTH] Password change error:", error);
      return {
        success: false,
        message: "Server connection error",
      };
    }
  }

  // Get public servers
  async getPublicServers(): Promise<ServersResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/servers`, {
        headers: this.getAuthHeaders(),
      });

      return await response.json();
    } catch (error) {
      console.error("[AUTH] Servers retrieval error:", error);
      return {
        success: false,
        message: "Server connection error",
      };
    }
  }

  // Check authentication status
  isAuthenticated(): boolean {
    return !!(this.getToken() && this.getStoredUser());
  }

  // Get user from local storage
  getCurrentUser(): User | null {
    return this.getStoredUser();
  }

  // Get token from local storage
  getCurrentToken(): string | null {
    return this.getToken();
  }
}

export default AuthService;
