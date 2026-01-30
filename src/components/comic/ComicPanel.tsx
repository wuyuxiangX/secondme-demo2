"use client";

import { useState } from "react";

interface ComicPanelProps {
  panelOrder: number;
  title: string;
  imageBase64: string | null;
  sceneDesc: string;
  status: string;
}

export default function ComicPanel({
  panelOrder,
  title,
  imageBase64,
  sceneDesc,
  status,
}: ComicPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <div
        className="comic-panel"
        onClick={() => imageBase64 && setIsExpanded(true)}
      >
        <div className="comic-panel-number">{panelOrder}</div>
        <div className="comic-panel-title">{title}</div>

        {status === "completed" && imageBase64 ? (
          <div className="comic-panel-image">
            <img
              src={`data:image/png;base64,${imageBase64}`}
              alt={title}
            />
          </div>
        ) : status === "generating" ? (
          <div className="comic-panel-loading">
            <div className="spinner"></div>
            <p>生成中...</p>
          </div>
        ) : status === "failed" ? (
          <div className="comic-panel-error">
            <p>生成失败</p>
          </div>
        ) : (
          <div className="comic-panel-pending">
            <p>等待生成</p>
          </div>
        )}
      </div>

      {isExpanded && imageBase64 && (
        <div className="comic-panel-modal" onClick={() => setIsExpanded(false)}>
          <div className="comic-panel-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="comic-panel-modal-close"
              onClick={() => setIsExpanded(false)}
            >
              ×
            </button>
            <img
              src={`data:image/png;base64,${imageBase64}`}
              alt={title}
            />
            <div className="comic-panel-modal-info">
              <h3>{title}</h3>
              <p>{sceneDesc}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
