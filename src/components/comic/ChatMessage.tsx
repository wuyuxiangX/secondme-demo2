"use client";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isAutoMode?: boolean;
}

export default function ChatMessage({ role, content, isStreaming, isAutoMode }: ChatMessageProps) {
  const isUser = role === "user";

  // In auto mode: user messages are from AI interviewee, assistant messages are from AI interviewer
  const avatarText = isAutoMode
    ? (isUser ? "分身" : "采访")
    : (isUser ? "你" : "AI");

  return (
    <div
      className={`chat-message ${isUser ? "chat-message-user" : "chat-message-assistant"}`}
    >
      <div className="chat-avatar">
        {avatarText}
      </div>
      <div className={`chat-bubble ${isUser ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
        {content}
        {isStreaming && <span className="typing-indicator">|</span>}
      </div>
    </div>
  );
}
