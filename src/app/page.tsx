"use client";

import { useAuth } from "@/contexts/AuthContext";
import LoginButton from "@/components/LoginButton";
import UserProfile from "@/components/UserProfile";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card" style={{ minWidth: "420px" }}>
          <div className="loading">
            <div className="spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      {/* Decorative comic elements */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          fontFamily: "'Bangers', cursive",
          fontSize: "24px",
          color: "var(--ink)",
          opacity: 0.15,
          transform: "rotate(-5deg)",
        }}
      >
        我的故事
      </div>
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          fontFamily: "'Bangers', cursive",
          fontSize: "18px",
          color: "var(--ink)",
          opacity: 0.15,
          transform: "rotate(3deg)",
        }}
      >
        ★ 独一无二 ★
      </div>

      <div className="card" style={{ minWidth: "420px", maxWidth: "480px" }}>
        {/* Panel number decoration */}
        <span className="panel-decoration top-left">序章</span>

        {/* Main Title with comic style */}
        <h1 className="comic-title">漫画人生</h1>

        {/* Subtitle in speech bubble style */}
        <div className="speech-bubble" style={{ marginTop: "20px", marginBottom: "30px" }}>
          <p style={{ textAlign: "center", fontWeight: 700 }}>
            每个人都是自己故事的主角！登录后，我们将为你创作专属的连环画自传！
          </p>
        </div>

        {user ? <UserProfile /> : <LoginButton />}

        {/* Bottom decoration */}
        <span className="panel-decoration bottom-right">你的故事即将开始...</span>
      </div>
    </div>
  );
}
