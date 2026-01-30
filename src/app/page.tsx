"use client";

import { useAuth } from "@/contexts/AuthContext";
import LoginButton from "@/components/LoginButton";
import UserProfile from "@/components/UserProfile";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card">
          <div className="loading">
            <div className="spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="card" style={{ minWidth: "400px" }}>
        <h1 className="text-center mb-4" style={{ fontSize: "28px", color: "#333" }}>
          Comic Books
        </h1>
        <p className="text-center mb-4" style={{ color: "#666" }}>
          SecondMe OAuth Integration Demo
        </p>

        {user ? <UserProfile /> : <LoginButton />}
      </div>
    </div>
  );
}
