"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ComicGallery from "@/components/comic/ComicGallery";

interface ComicProject {
  id: string;
  title: string;
  status: string;
  style: string;
  life_summary: string;
}

interface Panel {
  id: string;
  panel_order: number;
  title: string;
  scene_desc: string;
  image_base64: string | null;
  status: string;
}

export default function GalleryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ComicProject | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
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

      // Redirect if not completed
      if (projectData.project.status !== "completed") {
        if (projectData.project.status === "generating") {
          router.push(`/comic/${projectId}/generate`);
        } else if (projectData.project.status === "analyzing") {
          router.push(`/comic/${projectId}/preview`);
        } else {
          router.push(`/comic/${projectId}/chat`);
        }
        return;
      }

      if (panelsRes.ok) {
        const panelsData = await panelsRes.json();
        setPanels(panelsData.panels || []);
      }
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
    <div className="gallery-page">
      <div className="gallery-page-header">
        <Link href="/comic" className="back-link">
          ← 我的漫画
        </Link>
      </div>

      <div className="gallery-page-content">
        <ComicGallery
          panels={panels}
          title={project.title}
          lifeSummary={project.life_summary}
        />

        <div className="gallery-actions">
          <Link href="/comic" className="btn btn-secondary">
            返回项目列表
          </Link>
          <button
            onClick={() => {
              // Share functionality - could be expanded
              if (navigator.share) {
                navigator.share({
                  title: project.title,
                  text: `查看我的人生漫画：${project.title}`,
                });
              }
            }}
            className="btn btn-primary"
          >
            分享漫画
          </button>
        </div>
      </div>
    </div>
  );
}
