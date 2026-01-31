// OpenRouter API integration for image generation
import { proxyFetch } from './proxy-fetch';
import { COMIC_STYLES, PANEL_STRUCTURE } from './comic-styles';

// Re-export for backwards compatibility
export { COMIC_STYLES, PANEL_STRUCTURE };

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

export async function generateImage(
  prompt: string,
  style: string = 'chinese'
): Promise<ImageGenerationResult> {
  // Check for Silicon Flow API first (works in China)
  const siliconFlowKey = process.env.SILICONFLOW_API_KEY;
  if (siliconFlowKey) {
    return generateImageWithSiliconFlow(prompt, style, siliconFlowKey);
  }

  // Fall back to OpenRouter
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'No image generation API key configured',
    };
  }

  const styleInfo = COMIC_STYLES[style] || COMIC_STYLES.chinese;
  const fullPrompt = `Create a single comic panel illustration: ${prompt}. Style: ${styleInfo.prompt}. The image should be a complete scene suitable for a life story comic panel. No text or speech bubbles in the image.`;

  try {
    // Use OpenAI GPT-5 image model for generation
    const response = await proxyFetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': 'Comic Life Generator',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-image-mini',
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

    // DALL-E 3 response format: { data: [{ b64_json: "...", revised_prompt: "..." }] }
    if (data.data?.[0]?.b64_json) {
      return {
        success: true,
        imageBase64: data.data[0].b64_json,
      };
    }

    // DALL-E 3 URL format: { data: [{ url: "..." }] }
    if (data.data?.[0]?.url) {
      // Fetch the image and convert to base64
      try {
        const imageResponse = await proxyFetch(data.data[0].url);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return {
          success: true,
          imageBase64: base64,
        };
      } catch (fetchError) {
        console.error('Failed to fetch image URL:', fetchError);
      }
    }

    // Format: OpenRouter GPT-5 Image returns images in message.images array
    const images = data.choices?.[0]?.message?.images;
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (img.image_url?.url) {
          const url = img.image_url.url;
          if (url.startsWith('data:image')) {
            const base64 = url.split(',')[1];
            return {
              success: true,
              imageBase64: base64,
            };
          }
          // If it's a regular URL, fetch it
          try {
            const imageResponse = await proxyFetch(url);
            const arrayBuffer = await imageResponse.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            return {
              success: true,
              imageBase64: base64,
            };
          } catch (fetchError) {
            console.error('Failed to fetch image URL:', fetchError);
          }
        }
      }
    }

    // Extract image from response for other formats
    const content = data.choices?.[0]?.message?.content;

    if (content) {
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
        return {
          success: true,
          imageBase64: content,
        };
      }
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

    console.error('Unexpected response format:', JSON.stringify(data).slice(0, 500));
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

// Silicon Flow API for image generation (works in China)
async function generateImageWithSiliconFlow(
  prompt: string,
  style: string,
  apiKey: string
): Promise<ImageGenerationResult> {
  const styleInfo = COMIC_STYLES[style] || COMIC_STYLES.chinese;
  const fullPrompt = `${prompt}. Style: ${styleInfo.prompt}. High quality comic illustration, single panel, no text.`;

  try {
    const response = await proxyFetch('https://api.siliconflow.cn/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: fullPrompt,
        image_size: '1024x1024',
        num_inference_steps: 20,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Silicon Flow API error:', errorText);
      return {
        success: false,
        error: `Silicon Flow API error: ${response.status}`,
      };
    }

    const data = await response.json();

    // Silicon Flow returns { images: [{ url: "..." }] }
    if (data.images?.[0]?.url) {
      try {
        const imageResponse = await proxyFetch(data.images[0].url);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return {
          success: true,
          imageBase64: base64,
        };
      } catch (fetchError) {
        console.error('Failed to fetch Silicon Flow image URL:', fetchError);
        return {
          success: false,
          error: 'Failed to download generated image',
        };
      }
    }

    // Alternative format: direct base64
    if (data.images?.[0]?.b64_json) {
      return {
        success: true,
        imageBase64: data.images[0].b64_json,
      };
    }

    console.error('Unexpected Silicon Flow response:', JSON.stringify(data).slice(0, 500));
    return {
      success: false,
      error: 'Could not extract image from Silicon Flow response',
    };
  } catch (error) {
    console.error('Silicon Flow request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
