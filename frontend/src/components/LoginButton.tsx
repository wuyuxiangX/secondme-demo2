"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginButton() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {error && <div className="error">{error}</div>}
      <button
        className="btn btn-primary"
        onClick={handleLogin}
        disabled={loading}
        style={{ width: "100%", padding: "16px 32px" }}
      >
        {loading ? (
          <>
            <div className="spinner" style={{ width: "20px", height: "20px", marginRight: "8px" }}></div>
            正在跳转...
          </>
        ) : (
          <>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{ marginRight: "8px" }}
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"
                fill="currentColor"
              />
            </svg>
            使用 SecondMe 登录
          </>
        )}
      </button>
      <p style={{ fontSize: "14px", color: "#666", textAlign: "center" }}>
        点击登录将跳转到 SecondMe 进行授权
      </p>
    </div>
  );
}
