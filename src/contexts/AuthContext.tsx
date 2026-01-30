"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface UserInfo {
  id: string;
  name?: string;
  nickname?: string;
  email?: string;
  avatar?: string;
  shades?: string[];
  [key: string]: unknown;
}

interface User {
  id: string;
  userInfo: UserInfo;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  handleCallback: (code: string, state: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = "/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  // Initiate OAuth login
  const login = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/auth/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate authorization");
      }

      const data = await response.json();

      // Store state for verification
      localStorage.setItem("oauth_state", data.params.state);

      // Build authorization URL with new format
      const params = new URLSearchParams({
        client_id: data.params.client_id,
        redirect_uri: data.params.redirect_uri,
        response_type: data.params.response_type,
        state: data.params.state,
      });

      // Redirect to SecondMe authorization page
      window.location.href = `${data.authorizeUrl}?${params.toString()}`;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }, []);

  // Handle OAuth callback
  const handleCallback = useCallback(async (code: string, state: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, state }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Authentication failed");
      }

      const data = await response.json();

      // Store user in local storage and state
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.removeItem("oauth_state");
      setUser(data.user);
    } catch (error) {
      console.error("Callback error:", error);
      throw error;
    }
  }, []);

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem("oauth_state");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, handleCallback }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
