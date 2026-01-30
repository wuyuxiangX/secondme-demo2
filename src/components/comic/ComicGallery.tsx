"use client";

import ComicPanel from "./ComicPanel";

interface Panel {
  id: string;
  panel_order: number;
  title: string;
  scene_desc: string;
  image_base64: string | null;
  status: string;
}

interface ComicGalleryProps {
  panels: Panel[];
  title: string;
  lifeSummary?: string;
}

export default function ComicGallery({ panels, title, lifeSummary }: ComicGalleryProps) {
  const handleDownload = async () => {
    // Download each panel as separate images
    for (const panel of panels) {
      if (panel.image_base64) {
        const link = document.createElement("a");
        link.href = `data:image/png;base64,${panel.image_base64}`;
        link.download = `${title}-${panel.panel_order}-${panel.title}.png`;
        link.click();
      }
    }
  };

  return (
    <div className="comic-gallery">
      <div className="comic-gallery-header">
        <h2 className="comic-gallery-title">{title}</h2>
        {lifeSummary && (
          <p className="comic-gallery-summary">{lifeSummary}</p>
        )}
      </div>

      <div className="comic-gallery-grid">
        {panels.map((panel) => (
          <ComicPanel
            key={panel.id}
            panelOrder={panel.panel_order}
            title={panel.title}
            imageBase64={panel.image_base64}
            sceneDesc={panel.scene_desc}
            status={panel.status}
          />
        ))}
      </div>

      <div className="comic-gallery-actions">
        <button onClick={handleDownload} className="btn btn-primary">
          下载全部漫画
        </button>
      </div>
    </div>
  );
}
