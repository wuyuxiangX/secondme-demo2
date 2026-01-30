"use client";

import { COMIC_STYLES } from "@/lib/openrouter";

interface StyleSelectorProps {
  selectedStyle: string;
  onSelect: (style: string) => void;
}

const styleEmojis: Record<string, string> = {
  chinese: "🐉",
  japanese: "🌸",
  western: "⚡",
  watercolor: "🎨",
};

const styleDescriptions: Record<string, string> = {
  chinese: "鲜艳的色彩，干净的线条，充满活力",
  japanese: "细腻的线条，富有表现力的眼睛，温柔的风格",
  western: "粗犷的轮廓，戏剧性的阴影，强烈的视觉冲击",
  watercolor: "温暖的色调，柔和的边缘，故事书般的感觉",
};

export default function StyleSelector({ selectedStyle, onSelect }: StyleSelectorProps) {
  return (
    <div className="style-selector">
      <h3 className="style-selector-title">选择漫画风格</h3>
      <div className="style-grid">
        {Object.entries(COMIC_STYLES).map(([key, style]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`style-card ${selectedStyle === key ? "style-card-selected" : ""}`}
          >
            <span className="style-emoji">{styleEmojis[key]}</span>
            <span className="style-name">{style.name}</span>
            <span className="style-desc">{styleDescriptions[key]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
