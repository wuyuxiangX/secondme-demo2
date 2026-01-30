"use client";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`chat-message ${isUser ? "chat-message-user" : "chat-message-assistant"}`}
    >
      <div className="chat-avatar">
        {isUser ? "你" : "AI"}
      </div>
      <div className={`chat-bubble ${isUser ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
        {content}
        {isStreaming && <span className="typing-indicator">|</span>}
      </div>
    </div>
  );
}
