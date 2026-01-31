"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import ChatInterface from "@/components/comic/ChatInterface";

interface ComicProject {
  id: string;
  title: string;
  status: string;
  style: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ComicProject | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      if (!user) return;

      try {
        const [projectRes, chatRes] = await Promise.all([
          fetch(`/api/comic/projects/${projectId}`, {
            headers: { "x-user-id": user.id },
            signal: abortController.signal,
          }),
          fetch(`/api/comic/projects/${projectId}/chat`, {
            headers: { "x-user-id": user.id },
            signal: abortController.signal,
          }),
        ]);

        if (!projectRes.ok) {
          throw new Error("Project not found");
        }

        const projectData = await projectRes.json();
        setProject(projectData.project);

        // Redirect if project is already analyzed or completed
        if (["analyzing", "generating", "completed"].includes(projectData.project.status)) {
          if (projectData.project.status === "completed") {
            router.push(`/comic/${projectId}/gallery`);
          } else {
            router.push(`/comic/${projectId}/preview`);
          }
          return;
        }

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          setMessages(
            (chatData.conversations || []).map((c: { id: string; role: string; content: string }) => ({
              id: c.id,
              role: c.role,
              content: c.content,
            }))
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // 请求被取消，忽略
        }
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (!authLoading && user) {
      fetchData();
    } else if (!authLoading && !user) {
      router.push("/");
    }

    return () => {
      abortController.abort();
    };
  }, [authLoading, user, projectId, router]);

  const handleComplete = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/comic/projects/${projectId}/analyze`, {
        method: "POST",
        headers: {
          "x-user-id": user.id,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "分析失败");
      }

      router.push(`/comic/${projectId}/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
      setLoading(false);
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

  if (!project || !user) {
    return null;
  }

  return (
    <div className="chat-page">
      <div className="chat-page-header">
        <Link href="/comic" className="back-link">
          ← 返回
        </Link>
        <h1 className="chat-page-title">{project.title}</h1>
      </div>

      <div className="chat-page-content">
        <div className="chat-instruction">
          <p>AI 采访者将与你的 AI 分身进行对话，收集你的人生故事信息。完成后将自动开始创作漫画。</p>
        </div>

        <ChatInterface
          projectId={projectId}
          userId={user.id}
          initialMessages={messages}
          onComplete={handleComplete}
          autoMode={true}
        />
      </div>
    </div>
  );
}
