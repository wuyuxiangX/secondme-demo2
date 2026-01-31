// Comic style definitions - shared between client and server

export const COMIC_STYLES: Record<string, { name: string; prompt: string }> = {
  chinese: {
    name: '中国漫画',
    prompt: 'Chinese manhua style, vibrant colors, clean lines, dynamic composition, expressive characters, cel-shaded, professional manga coloring',
  },
  japanese: {
    name: '日本漫画',
    prompt: 'Japanese manga style, detailed lines, expressive eyes, soft shading, shoujo/shounen aesthetic, clean art, professional illustration',
  },
  western: {
    name: '西方漫画',
    prompt: 'Western comic style, bold outlines, dramatic shading, vivid colors, superhero comic aesthetic, dynamic poses, professional comic art',
  },
  watercolor: {
    name: '手绘插画',
    prompt: 'Watercolor illustration style, warm tones, storybook aesthetic, soft edges, gentle colors, artistic hand-painted look, children book illustration',
  },
};

// Panel structure definitions
export const PANEL_STRUCTURE = [
  { order: 1, title: '我的人生', description: '综合人生故事的代表性场景' },
];
