"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import StyleSelector from "@/components/comic/StyleSelector";

interface ComicProject {
  id: string;
  title: string;
  status: string;
  style: string;
  created_at: number;
  updated_at: number;
}

const statusLabels: Record<string, string> = {
  draft: "草稿",
  chatting: "对话中",
  analyzing: "分析中",
  generating: "生成中",
  completed: "已完成",
};

const statusColors: Record<string, string> = {
  draft: "var(--comic-cyan)",
  chatting: "var(--comic-blue)",
  analyzing: "var(--comic-orange)",
  generating: "var(--comic-purple)",
  completed: "var(--comic-green)",
};

export default function ComicProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ComicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStyle, setNewStyle] = useState("chinese");
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch("/api/comic/projects", {
        headers: {
          "x-user-id": user.id,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchProjects();
    } else if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router, fetchProjects]);

  const createProject = async () => {
    if (!user || !newTitle.trim()) return;

    setCreating(true);
    try {
      const response = await fetch("/api/comic/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          style: newStyle,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create project");
      }

      const data = await response.json();
      router.push(`/comic/${data.project.id}/chat`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setCreating(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!user || !confirm("确定要删除这个项目吗？")) return;

    try {
      const response = await fetch(`/api/comic/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": user.id,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete project");
      }

      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const getProjectLink = (project: ComicProject) => {
    switch (project.status) {
      case "draft":
      case "chatting":
        return `/comic/${project.id}/chat`;
      case "analyzing":
        return `/comic/${project.id}/preview`;
      case "generating":
        return `/comic/${project.id}/generate`;
      case "completed":
        return `/comic/${project.id}/gallery`;
      default:
        return `/comic/${project.id}/chat`;
    }
  };

  if (authLoading || loading) {
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
    <div className="comic-projects-page">
      <div className="comic-projects-container">
        <div className="comic-projects-header">
          <Link href="/" className="back-link">
            ← 返回首页
          </Link>
          <h1 className="comic-title">我的漫画</h1>
        </div>

        {error && <div className="error">{error}</div>}

        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="btn btn-primary create-project-btn"
          >
            + 创建新漫画
          </button>
        ) : (
          <div className="create-project-form">
            <h3 className="create-form-title">创建新漫画项目</h3>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="给你的人生漫画起个名字..."
              className="create-title-input"
              autoFocus
            />

            <StyleSelector selectedStyle={newStyle} onSelect={setNewStyle} />

            <div className="create-form-actions">
              <button
                onClick={createProject}
                disabled={creating || !newTitle.trim()}
                className="btn btn-primary"
              >
                {creating ? "创建中..." : "开始创作"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewTitle("");
                }}
                className="btn btn-secondary"
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="projects-list">
          {projects.length === 0 ? (
            <div className="no-projects">
              <p>还没有创建任何漫画项目</p>
              <p>点击上方按钮开始你的第一部人生漫画！</p>
            </div>
          ) : (
            projects.map((project) => (
              <div key={project.id} className="project-card">
                <Link href={getProjectLink(project)} className="project-link">
                  <h3 className="project-title">{project.title}</h3>
                  <span
                    className="project-status"
                    style={{ background: statusColors[project.status] }}
                  >
                    {statusLabels[project.status] || project.status}
                  </span>
                  <p className="project-date">
                    创建于 {new Date(project.created_at * 1000).toLocaleDateString("zh-CN")}
                  </p>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    deleteProject(project.id);
                  }}
                  className="project-delete-btn"
                  title="删除项目"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
