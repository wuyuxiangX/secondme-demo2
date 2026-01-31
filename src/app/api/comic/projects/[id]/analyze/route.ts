import { NextRequest, NextResponse } from 'next/server';
import {
  getUserById,
  getComicProject,
  updateComicProject,
  getConversations,
  createPanels,
  updateUserTokens,
} from '@/lib/db';
import { PANEL_STRUCTURE } from '@/lib/openrouter';
import { proxyFetch } from '@/lib/proxy-fetch';

const ANALYSIS_PROMPT = `基于以下对话内容，为用户创作一幅综合性的人生漫画。请分析对话，提取关键信息，生成一个能够代表用户人生故事的场景描述。

对话内容：
{conversations}

请生成一个综合性的漫画场景描述，这个场景应该：
1. 包含具体的视觉元素（人物、场景、动作、表情）
2. 综合体现用户人生中最重要的时刻或特征
3. 富有情感和故事性
4. 适合转化为漫画画面

输出格式必须是JSON，包含以下字段：
{
  "character_desc": "主角的外貌描述（发型、大致年龄范围、穿着风格等）",
  "life_summary": "用户人生故事的简短总结（50-100字）",
  "panels": [
    {
      "title": "我的人生",
      "scene_desc": "详细的场景描述，包括具体的视觉元素，综合展现用户的人生故事..."
    }
  ]
}

只输出JSON，不要有其他文字。`;

async function getAuthenticatedUser(request: NextRequest) {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return { error: 'Authentication required', status: 401 };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { error: 'User not found', status: 401 };
  }

  // Check if token is expired and refresh if needed
  const now = Math.floor(Date.now() / 1000);
  if (user.token_expires_at < now + 300) {
    try {
      const refreshResponse = await proxyFetch(process.env.OAUTH_REFRESH_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: user.refresh_token,
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
        }),
      });

      if (refreshResponse.ok) {
        const tokenData = await refreshResponse.json();
        await updateUserTokens(userId, tokenData.accessToken, tokenData.refreshToken, tokenData.expiresIn);
        user.access_token = tokenData.accessToken;
      }
    } catch (error) {
      console.error('Auto refresh failed:', error);
    }
  }

  return { user };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const project = await getComicProject(id);

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    // Get conversations
    const conversations = await getConversations(id);

    if (conversations.length < 2) {
      return NextResponse.json(
        { error: 'Need more conversation to analyze' },
        { status: 400 }
      );
    }

    // Format conversations for analysis
    const conversationText = conversations
      .map((c) => `${c.role === 'user' ? '用户' : 'AI'}: ${c.content}`)
      .join('\n\n');

    const prompt = ANALYSIS_PROMPT.replace('{conversations}', conversationText);

    // Update status to analyzing
    await updateComicProject(id, { status: 'analyzing' });

    // Call SecondMe API for analysis (using streaming endpoint)
    const response = await proxyFetch(`${process.env.SECONDME_API_BASE}/secondme/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.user.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        systemPrompt: '你是一个专业的漫画故事分析师，擅长将对话内容转化为漫画故事大纲。请只输出JSON格式的结果。',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SecondMe API error:', errorText);
      await updateComicProject(id, { status: 'chatting' });
      return NextResponse.json(
        { error: 'Failed to analyze conversation' },
        { status: 500 }
      );
    }

    // Parse streaming response to get full content
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'event: session' || line === 'event: content' || line === 'event: done') {
          continue;
        }

        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.content || parsed.choices?.[0]?.delta?.content || '';
            if (chunk) {
              content += chunk;
            }
          } catch {
            // Not valid JSON
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.content || parsed.choices?.[0]?.delta?.content || '';
            if (chunk) {
              content += chunk;
            }
          } catch {
            // Not valid JSON
          }
        }
      }
    }

    // Parse JSON from response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse analysis:', parseError, content);
      // Fall back to default structure with generic descriptions
      analysis = {
        character_desc: '一位普通人，有着独特的人生经历',
        life_summary: '一段充满故事的人生旅程',
        panels: PANEL_STRUCTURE.map((p) => ({
          title: p.title,
          scene_desc: `${p.description}的场景，展现人生的重要时刻`,
        })),
      };
    }

    // Validate analysis structure
    if (!analysis.panels || !Array.isArray(analysis.panels) || analysis.panels.length !== 1) {
      // Fix panels if needed
      analysis.panels = PANEL_STRUCTURE.map((p, i) => ({
        title: p.title,
        scene_desc: analysis.panels?.[i]?.scene_desc || `${p.description}的场景`,
      }));
    }

    // Update project with character description, life summary and status
    await updateComicProject(id, {
      status: 'preview',
      character_desc: analysis.character_desc,
      life_summary: analysis.life_summary,
    });

    // Create panels in database
    const panels = await createPanels(
      id,
      analysis.panels.map((p: { title: string; scene_desc: string }) => ({
        title: p.title,
        scene_desc: p.scene_desc,
      }))
    );

    return NextResponse.json({
      character_desc: analysis.character_desc,
      life_summary: analysis.life_summary,
      panels,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    await updateComicProject(id, { status: 'chatting' });
    return NextResponse.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
