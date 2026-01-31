"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import StoryPreview from "@/components/comic/StoryPreview";
import StyleSelector from "@/components/comic/StyleSelector";

interface ComicProject {
  id: string;
  title: string;
  status: string;
  style: string;
  character_desc: string;
  life_summary: string;
}

interface Panel {
  id: string;
  title: string;
  scene_desc: string;
  panel_order: number;
}

export default function PreviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ComicProject | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("chinese");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [projectRes, panelsRes] = await Promise.all([
        fetch(`/api/comic/projects/${projectId}`, {
          headers: { "x-user-id": user.id },
        }),
        fetch(`/api/comic/projects/${projectId}/panels`, {
          headers: { "x-user-id": user.id },
        }),
      ]);

      if (!projectRes.ok) {
        throw new Error("Project not found");
      }

      const projectData = await projectRes.json();
      setProject(projectData.project);
      setSelectedStyle(projectData.project.style || "chinese");

      // If project is still analyzing, show loading
      if (projectData.project.status === "analyzing") {
        setAnalyzing(true);
        // Poll for completion
        setTimeout(() => fetchData(), 2000);
        return;
      }

      // Redirect based on status
      if (projectData.project.status === "generating") {
        router.push(`/comic/${projectId}/generate`);
        return;
      }
      if (projectData.project.status === "completed") {
        router.push(`/comic/${projectId}/gallery`);
        return;
      }
      if (projectData.project.status === "chatting" || projectData.project.status === "draft") {
        router.push(`/comic/${projectId}/chat`);
        return;
      }

      if (panelsRes.ok) {
        const panelsData = await panelsRes.json();
        setPanels(panelsData.panels || []);
      }

      setAnalyzing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [user, projectId, router]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    } else if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router, fetchData]);

  const handleStyleChange = async (style: string) => {
    if (!user) return;

    setSelectedStyle(style);

    try {
      await fetch(`/api/comic/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
        },
        body: JSON.stringify({ style }),
      });
    } catch (err) {
      console.error("Failed to update style:", err);
    }
  };

  const handleGenerate = () => {
    router.push(`/comic/${projectId}/generate`);
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

  if (analyzing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card" style={{ minWidth: "420px", textAlign: "center" }}>
          <h2 className="comic-title" style={{ fontSize: "32px" }}>分析中...</h2>
          <div className="loading" style={{ minHeight: "100px" }}>
            <div className="spinner"></div>
          </div>
          <p style={{ marginTop: "16px" }}>正在分析你的人生故事，生成漫画场景...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card" style={{ minWidth: "420px" }}>
          <div className="error">{error}</div>
          <Link href="/comic" className="btn btn-secondary" style={{ marginTop: "16px" }}>
            返回项目列表
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="preview-page">
      <div className="preview-page-header">
        <Link href="/comic" className="back-link">
          ← 返回
        </Link>
        <h1 className="preview-page-title">{project.title}</h1>
      </div>

      <div className="preview-page-content">
        {panels.length > 0 && (
          <StoryPreview
            panels={panels}
            lifeSummary={project.life_summary || ""}
            characterDesc={project.character_desc || ""}
          />
        )}

        <div className="preview-style-section">
          <StyleSelector
            selectedStyle={selectedStyle}
            onSelect={handleStyleChange}
          />
        </div>

        <div className="preview-actions">
          <Link href={`/comic/${projectId}/chat`} className="btn btn-secondary">
            返回修改对话
          </Link>
          <button onClick={handleGenerate} className="btn btn-primary">
            开始生成漫画
          </button>
        </div>
      </div>
    </div>
  );
}
