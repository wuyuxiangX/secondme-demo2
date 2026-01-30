"use client";

interface PanelProgress {
  panel_id: string;
  panel_order: number;
  title: string;
  status: "pending" | "generating" | "completed" | "error";
  image_base64?: string;
  error?: string;
}

interface GenerationProgressProps {
  panels: PanelProgress[];
  currentPanel: number;
  total: number;
}

export default function GenerationProgress({
  panels,
  currentPanel,
  total,
}: GenerationProgressProps) {
  const completedCount = panels.filter((p) => p.status === "completed").length;
  const progressPercent = (completedCount / total) * 100;

  return (
    <div className="generation-progress">
      <h3 className="generation-title">正在创作你的漫画...</h3>

      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="progress-text">
        已完成 {completedCount} / {total} 幅
      </p>

      <div className="generation-panels">
        {panels.map((panel) => (
          <div
            key={panel.panel_id}
            className={`generation-panel ${
              panel.status === "generating" ? "generation-panel-active" : ""
            } ${panel.status === "completed" ? "generation-panel-completed" : ""} ${
              panel.status === "error" ? "generation-panel-error" : ""
            }`}
          >
            <div className="generation-panel-header">
              <span className="generation-panel-number">{panel.panel_order}</span>
              <span className="generation-panel-title">{panel.title}</span>
              <span className="generation-panel-status">
                {panel.status === "pending" && "等待中"}
                {panel.status === "generating" && (
                  <span className="generating-indicator">
                    <span className="generating-dot"></span>
                    生成中...
                  </span>
                )}
                {panel.status === "completed" && "✓ 完成"}
                {panel.status === "error" && "✗ 失败"}
              </span>
            </div>

            {panel.status === "completed" && panel.image_base64 && (
              <div className="generation-panel-preview">
                <img
                  src={`data:image/png;base64,${panel.image_base64}`}
                  alt={panel.title}
                />
              </div>
            )}

            {panel.status === "error" && panel.error && (
              <p className="generation-panel-error">{panel.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
