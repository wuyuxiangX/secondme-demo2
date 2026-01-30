"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function UserProfile() {
  const { user, logout } = useAuth();

  if (!user) return null;

  // Handle case where userInfo is missing or invalid
  if (!user.userInfo) {
    return (
      <div className="user-info">
        <div className="error">获取个人信息失败，请重新登录！</div>
        <button className="btn btn-danger" onClick={logout} style={{ width: "100%" }}>
          重新登录
        </button>
      </div>
    );
  }

  const userInfo = user.userInfo;
  const displayName = String(userInfo.name || userInfo.nickname || "主角");
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="user-info">
      {/* Hero Avatar */}
      <div className="user-avatar">{initial}</div>

      {/* Hero Name */}
      <h2 className="user-name">{displayName}</h2>

      {/* Hero Stats Panel */}
      <div
        style={{
          marginTop: "16px",
          border: "3px solid var(--ink)",
          padding: "4px",
          background: "var(--paper-shadow)",
        }}
      >
        <div
          style={{
            background: "var(--comic-blue)",
            color: "var(--comic-white)",
            padding: "8px 12px",
            fontFamily: "'Bangers', cursive",
            letterSpacing: "2px",
            textAlign: "center",
            borderBottom: "2px solid var(--ink)",
          }}
        >
          ★ 主角档案 ★
        </div>

        {userInfo.email && (
          <div className="user-detail">
            <span className="user-detail-label">联系方式</span>
            <span className="user-detail-value">{userInfo.email}</span>
          </div>
        )}
        <div className="user-detail">
          <span className="user-detail-label">用户编号</span>
          <span
            className="user-detail-value"
            style={{ fontSize: "11px", fontFamily: "monospace" }}
          >
            {user.id}
          </span>
        </div>

        {/* Shades/Interests as comic tags */}
        {userInfo.shades &&
          Array.isArray(userInfo.shades) &&
          userInfo.shades.length > 0 && (
            <div
              style={{
                padding: "16px",
                borderTop: "2px dashed var(--ink)",
              }}
            >
              <span
                className="user-detail-label"
                style={{ display: "block", marginBottom: "12px" }}
              >
                故事元素 (兴趣爱好)
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                {userInfo.shades.map((shade: string, index: number) => (
                  <span key={index} className="comic-tag">
                    {shade}
                  </span>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Logout Button */}
      <div className="mt-8">
        <button
          className="btn btn-danger"
          onClick={logout}
          style={{ width: "100%" }}
        >
          退出登录
        </button>
      </div>

      {/* Success Message */}
      <div className="success" style={{ marginTop: "16px", marginBottom: 0 }}>
        <p style={{ fontSize: "14px", textAlign: "center" }}>
          已获取你的信息，即将为你创作专属连环画！
        </p>
      </div>
    </div>
  );
}
