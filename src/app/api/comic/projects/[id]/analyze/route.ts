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

const ANALYSIS_PROMPT = `基于以下对话内容，为用户创作一部6幅漫画的人生故事。请分析对话，提取关键信息，为每个面板生成详细的场景描述。

对话内容：
{conversations}

请为以下6个面板生成场景描述，每个场景描述应该：
1. 包含具体的视觉元素（人物、场景、动作、表情）
2. 体现该人生阶段的关键时刻
3. 富有情感和故事性
4. 适合转化为漫画画面

输出格式必须是JSON，包含以下字段：
{
  "character_desc": "主角的外貌描述（发型、大致年龄范围、穿着风格等）",
  "life_summary": "用户人生故事的简短总结（50-100字）",
  "panels": [
    {
      "title": "序章·起源",
      "scene_desc": "详细的场景描述，包括具体的视觉元素..."
    },
    {
      "title": "成长·童年",
      "scene_desc": "详细的场景描述..."
    },
    {
      "title": "转折·青春",
      "scene_desc": "详细的场景描述..."
    },
    {
      "title": "挑战·奋斗",
      "scene_desc": "详细的场景描述..."
    },
    {
      "title": "高光·成就",
      "scene_desc": "详细的场景描述..."
    },
    {
      "title": "展望·未来",
      "scene_desc": "详细的场景描述..."
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
      const refreshResponse = await fetch(process.env.OAUTH_REFRESH_URL!, {
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

    // Call SecondMe API for analysis
    const response = await fetch(`${process.env.SECONDME_API_BASE}/secondme/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.user.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        stream: false,
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

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
    if (!analysis.panels || !Array.isArray(analysis.panels) || analysis.panels.length !== 6) {
      // Fix panels if needed
      analysis.panels = PANEL_STRUCTURE.map((p, i) => ({
        title: p.title,
        scene_desc: analysis.panels?.[i]?.scene_desc || `${p.description}的场景`,
      }));
    }

    // Update project with character description and life summary
    await updateComicProject(id, {
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
