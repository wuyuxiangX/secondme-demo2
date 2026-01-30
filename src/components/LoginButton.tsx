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

      {/* Action burst effect container */}
      <div className="action-burst" style={{ width: "100%" }}>
        <button
          className="btn btn-primary"
          onClick={handleLogin}
          disabled={loading}
          style={{ width: "100%", padding: "18px 32px" }}
        >
          {loading ? (
            <>
              <div
                className="spinner"
                style={{
                  width: "24px",
                  height: "24px",
                  marginRight: "12px",
                  borderWidth: "3px",
                }}
              ></div>
              正在连接...
            </>
          ) : (
            <>
              {/* Pen/pencil icon for creating stories */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ marginRight: "10px" }}
              >
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              开始我的故事
            </>
          )}
        </button>
      </div>

      {/* Thought bubble hint */}
      <div className="thought-bubble" style={{ marginTop: "16px" }}>
        <p
          style={{
            fontSize: "14px",
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          通过 SecondMe 登录，让我们了解你的故事...
        </p>
      </div>
    </div>
  );
}
