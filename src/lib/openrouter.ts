// OpenRouter API integration for image generation

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

// Style prompt mappings
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
  { order: 1, title: '序章·起源', description: '童年/出生地' },
  { order: 2, title: '成长·童年', description: '童年重要经历' },
  { order: 3, title: '转折·青春', description: '学生时代关键时刻' },
  { order: 4, title: '挑战·奋斗', description: '职业/人生挑战' },
  { order: 5, title: '高光·成就', description: '骄傲时刻' },
  { order: 6, title: '展望·未来', description: '对未来的憧憬' },
];

export async function generateImage(
  prompt: string,
  style: string = 'chinese'
): Promise<ImageGenerationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'OpenRouter API key not configured',
    };
  }

  const styleInfo = COMIC_STYLES[style] || COMIC_STYLES.chinese;
  const fullPrompt = `Create a single comic panel illustration: ${prompt}. Style: ${styleInfo.prompt}. The image should be a complete scene suitable for a life story comic panel. No text or speech bubbles in the image.`;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': 'Comic Life Generator',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return {
        success: false,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();

    // Extract image from response
    // The response format may have the image in different places depending on the model
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        success: false,
        error: 'No content in response',
      };
    }

    // Handle different response formats
    // Format 1: Array of content parts with type "image"
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'image' && part.image) {
          return {
            success: true,
            imageBase64: part.image,
          };
        }
        if (part.type === 'image_url' && part.image_url?.url) {
          // Handle data URL format
          const url = part.image_url.url;
          if (url.startsWith('data:image')) {
            const base64 = url.split(',')[1];
            return {
              success: true,
              imageBase64: base64,
            };
          }
        }
      }
    }

    // Format 2: Direct base64 in response
    if (typeof content === 'string' && content.length > 1000) {
      // Likely a base64 image
      return {
        success: true,
        imageBase64: content,
      };
    }

    // Format 3: Check for inline_data in parts
    if (data.choices?.[0]?.message?.parts) {
      for (const part of data.choices[0].message.parts) {
        if (part.inline_data?.data) {
          return {
            success: true,
            imageBase64: part.inline_data.data,
          };
        }
      }
    }

    return {
      success: false,
      error: 'Could not extract image from response',
    };
  } catch (error) {
    console.error('OpenRouter request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function buildPanelPrompt(
  panelTitle: string,
  sceneDesc: string,
  characterDesc: string,
  style: string
): string {
  const styleInfo = COMIC_STYLES[style] || COMIC_STYLES.chinese;

  return `Panel "${panelTitle}": ${sceneDesc}. Character: ${characterDesc}. Style: ${styleInfo.prompt}`;
}
