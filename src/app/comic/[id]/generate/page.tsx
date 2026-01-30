"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import GenerationProgress from "@/components/comic/GenerationProgress";

interface ComicProject {
  id: string;
  title: string;
  status: string;
  style: string;
}

interface PanelProgress {
  panel_id: string;
  panel_order: number;
  title: string;
  status: "pending" | "generating" | "completed" | "error";
  image_base64?: string;
  error?: string;
}

export default function GeneratePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ComicProject | null>(null);
  const [panels, setPanels] = useState<PanelProgress[]>([]);
  const [currentPanel, setCurrentPanel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const generationStarted = useRef(false);

  const fetchProject = useCallback(async () => {
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

      // Redirect if completed
      if (projectData.project.status === "completed") {
        router.push(`/comic/${projectId}/gallery`);
        return;
      }

      if (panelsRes.ok) {
        const panelsData = await panelsRes.json();
        const panelProgress: PanelProgress[] = panelsData.panels.map((p: {
          id: string;
          panel_order: number;
          title: string;
          status: string;
          image_base64?: string;
        }) => ({
          panel_id: p.id,
          panel_order: p.panel_order,
          title: p.title,
          status: p.status === "completed" ? "completed" : "pending",
          image_base64: p.image_base64,
        }));
        setPanels(panelProgress);

        // Check if all panels are completed
        const allCompleted = panelProgress.every((p) => p.status === "completed");
        if (allCompleted && panelProgress.length > 0) {
          setCompleted(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [user, projectId, router]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchProject();
    } else if (!authLoading && !user) {
      router.push("/");
    }
  }, [authLoading, user, router, fetchProject]);

  const startGeneration = useCallback(async () => {
    if (!user || generationStarted.current) return;
    generationStarted.current = true;
    setGenerating(true);

    try {
      const response = await fetch(`/api/comic/projects/${projectId}/generate`, {
        method: "POST",
        headers: {
          "x-user-id": user.id,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start generation");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "progress") {
                setCurrentPanel(parsed.panel_order);
                setPanels((prev) =>
                  prev.map((p) =>
                    p.panel_id === parsed.panel_id
                      ? { ...p, status: "generating" }
                      : p
                  )
                );
              } else if (parsed.type === "completed") {
                setPanels((prev) =>
                  prev.map((p) =>
                    p.panel_id === parsed.panel_id
                      ? {
                          ...p,
                          status: "completed",
                          image_base64: parsed.image_base64,
                        }
                      : p
                  )
                );
              } else if (parsed.type === "error") {
                if (parsed.panel_id) {
                  setPanels((prev) =>
                    prev.map((p) =>
                      p.panel_id === parsed.panel_id
                        ? { ...p, status: "error", error: parsed.error }
                        : p
                    )
                  );
                } else {
                  setError(parsed.error);
                }
              } else if (parsed.type === "done") {
                setCompleted(true);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }, [user, projectId]);

  // Auto-start generation if panels exist and not completed
  useEffect(() => {
    if (!loading && panels.length > 0 && !completed && !generating) {
      const hasPending = panels.some((p) => p.status === "pending");
      if (hasPending && !generationStarted.current) {
        startGeneration();
      }
    }
  }, [loading, panels, completed, generating, startGeneration]);

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
    <div className="generate-page">
      <div className="generate-page-header">
        <Link href="/comic" className="back-link">
          ← 返回
        </Link>
        <h1 className="generate-page-title">{project.title}</h1>
      </div>

      <div className="generate-page-content">
        <GenerationProgress
          panels={panels}
          currentPanel={currentPanel}
          total={panels.length}
        />

        {completed && (
          <div className="generate-complete">
            <div className="success">漫画生成完成！</div>
            <Link href={`/comic/${projectId}/gallery`} className="btn btn-primary">
              查看完整漫画
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
