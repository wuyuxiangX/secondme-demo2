"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function UserProfile() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const userInfo = user.userInfo;
  const displayName = String(userInfo.name || userInfo.nickname || "用户");
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="user-info">
      <div className="user-avatar">{initial}</div>
      <h2 className="user-name text-center">{displayName}</h2>

      <div className="mt-4">
        {userInfo.email && (
          <div className="user-detail">
            <span className="user-detail-label">邮箱</span>
            <span className="user-detail-value">{userInfo.email}</span>
          </div>
        )}
        <div className="user-detail">
          <span className="user-detail-label">用户 ID</span>
          <span className="user-detail-value" style={{ fontSize: "12px", fontFamily: "monospace" }}>
            {user.id}
          </span>
        </div>
        {userInfo.shades && Array.isArray(userInfo.shades) && userInfo.shades.length > 0 && (
          <div className="user-detail" style={{ flexDirection: "column", gap: "8px" }}>
            <span className="user-detail-label">兴趣标签 (Shades)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {userInfo.shades.map((shade: string, index: number) => (
                <span
                  key={index}
                  style={{
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "white",
                    padding: "4px 12px",
                    borderRadius: "16px",
                    fontSize: "12px",
                  }}
                >
                  {shade}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <button className="btn btn-danger" onClick={logout} style={{ width: "100%" }}>
          退出登录
        </button>
      </div>

      <div className="mt-4 success">
        <p style={{ fontSize: "14px", textAlign: "center" }}>
          OAuth 认证成功，已获取用户信息
        </p>
      </div>
    </div>
  );
}
