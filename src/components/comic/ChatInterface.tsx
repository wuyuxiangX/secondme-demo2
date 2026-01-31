"use client";

import { useState, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  projectId: string;
  userId: string;
  initialMessages?: Message[];
  onComplete: () => void;
  autoMode?: boolean;
}

export default function ChatInterface({
  projectId,
  userId,
  initialMessages = [],
  onComplete,
  autoMode = false,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [autoProgress, setAutoProgress] = useState<{ round: number; total: number } | null>(null);
  const autoStartedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Start auto chat if autoMode is enabled
  useEffect(() => {
    if (autoMode && !autoStartedRef.current && messages.length === 0) {
      autoStartedRef.current = true;
      startAutoChat();
    } else if (!autoMode && messages.length === 0) {
      // Only send initial greeting in manual mode
      sendMessage("你好！请开始帮我回顾人生故事。");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode]);

  const startAutoChat = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/comic/projects/${projectId}/auto-chat`, {
        method: "POST",
        headers: {
          "x-user-id": userId,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start auto chat");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "round_start") {
                setAutoProgress({ round: parsed.round, total: parsed.total });
              } else if (parsed.type === "question") {
                const questionMessage: Message = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: parsed.content,
                };
                setMessages((prev) => [...prev, questionMessage]);
              } else if (parsed.type === "answer") {
                const answerMessage: Message = {
                  id: crypto.randomUUID(),
                  role: "user",
                  content: parsed.content,
                };
                setMessages((prev) => [...prev, answerMessage]);
              } else if (parsed.type === "complete") {
                setAutoProgress(null);
                onComplete();
              } else if (parsed.type === "error") {
                console.error("Auto chat error:", parsed.message);
                setAutoProgress(null);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Auto chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch(`/api/comic/projects/${projectId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ message: messageText.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Add the assistant message
      if (fullContent) {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullContent,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      // Add error message
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "抱歉，发送消息时出现了问题。请重试。",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const canComplete = messages.filter((m) => m.role === "user").length >= 3;

  return (
    <div className="chat-container">
      {/* Auto mode progress indicator */}
      {autoMode && autoProgress && (
        <div className="auto-progress">
          <div className="auto-progress-text">
            AI 对话进行中... 第 {autoProgress.round}/{autoProgress.total} 轮
          </div>
          <div className="auto-progress-bar">
            <div
              className="auto-progress-fill"
              style={{ width: `${(autoProgress.round / autoProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            isAutoMode={autoMode}
          />
        ))}
        {streamingContent && (
          <ChatMessage
            role="assistant"
            content={streamingContent}
            isStreaming
          />
        )}
        {autoMode && isLoading && messages.length === 0 && (
          <div className="auto-loading">
            <div className="spinner"></div>
            <span>正在启动 AI 对话...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Only show input form in manual mode */}
      {!autoMode && (
        <form onSubmit={handleSubmit} className="chat-input-form">
          <div className="chat-input-container">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="分享你的故事..."
              disabled={isLoading}
              rows={2}
              className="chat-input"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn btn-primary chat-send-btn"
            >
              {isLoading ? "..." : "发送"}
            </button>
          </div>
        </form>
      )}

      {/* Only show complete button in manual mode */}
      {!autoMode && canComplete && (
        <div className="chat-complete-section">
          <p className="chat-complete-hint">
            已收集足够的故事信息，可以开始创作漫画了！
          </p>
          <button
            onClick={onComplete}
            disabled={isLoading}
            className="btn btn-secondary chat-complete-btn"
          >
            完成对话，开始创作
          </button>
        </div>
      )}
    </div>
  );
}
