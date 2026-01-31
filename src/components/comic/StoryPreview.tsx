"use client";

interface Panel {
  id: string;
  title: string;
  scene_desc: string;
  panel_order: number;
}

interface StoryPreviewProps {
  panels: Panel[];
  lifeSummary: string;
  characterDesc: string;
}

export default function StoryPreview({
  panels,
  lifeSummary,
  characterDesc,
}: StoryPreviewProps) {
  return (
    <div className="story-preview">
      <div className="story-summary">
        <h3 className="story-summary-title">你的故事</h3>
        <p className="story-summary-text">{lifeSummary}</p>
        <p className="story-character">
          <span className="story-character-label">主角形象：</span>
          {characterDesc}
        </p>
      </div>

      <h3 className="story-panels-title">漫画场景</h3>
      <div className="story-panels-grid">
        {panels.map((panel) => (
          <div key={panel.id} className="story-panel-card">
            <div className="story-panel-header">
              <span className="story-panel-number">{panel.panel_order}</span>
              <span className="story-panel-title">{panel.title}</span>
            </div>
            <p className="story-panel-desc">{panel.scene_desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
