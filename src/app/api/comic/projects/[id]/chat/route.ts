import { NextRequest } from 'next/server';
import {
  getUserById,
  getComicProject,
  updateComicProject,
  addConversation,
  getConversations,
  updateUserTokens,
} from '@/lib/db';

const SYSTEM_PROMPT = `你是一位友善、富有同理心的人生故事采访者。你的任务是通过对话了解用户的人生经历，为创作一部6幅漫画的人生故事做准备。

你需要了解以下6个人生阶段的故事：
1. 序章·起源 - 出生地、家庭背景、童年环境
2. 成长·童年 - 童年最深刻的记忆、童年玩伴、童年梦想
3. 转折·青春 - 学生时代的关键时刻、重要的老师或朋友、影响深远的事件
4. 挑战·奋斗 - 职业选择、人生挑战、克服困难的经历
5. 高光·成就 - 最骄傲的时刻、重要的成就、值得纪念的瞬间
6. 展望·未来 - 对未来的憧憬、想要实现的梦想、期待的生活

对话指南：
- 每次只问1-2个问题，不要一次问太多
- 根据用户的回答自然地深入询问细节
- 用温暖、鼓励的语气
- 当收集到足够信息（每个阶段至少有一些内容）后，告诉用户可以点击"完成对话"按钮
- 帮助用户回忆具体的场景、情感和细节，这些将帮助创作更生动的漫画

开始时，请友好地介绍自己和这次对话的目的，然后从用户的出生地和童年开始询问。`;

async function getAuthenticatedUser(request: NextRequest) {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return { error: 'Authentication required', status: 401 };
  }

  const user = getUserById(userId);
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
        updateUserTokens(userId, tokenData.accessToken, tokenData.refreshToken, tokenData.expiresIn);
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
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = await params;
  const project = getComicProject(id);

  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (project.user_id !== auth.user.id) {
    return new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save user message
    addConversation(id, 'user', message);

    // Update project status to chatting
    if (project.status === 'draft') {
      updateComicProject(id, { status: 'chatting' });
    }

    // Get conversation history
    const conversations = getConversations(id);

    // Build messages for SecondMe API
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversations.map((c) => ({
        role: c.role,
        content: c.content,
      })),
    ];

    // Call SecondMe chat API with streaming
    const response = await fetch(`${process.env.SECONDME_API_BASE}/secondme/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.user.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SecondMe API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to get response from AI' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream the response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullResponse += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch {
                  // Not valid JSON, might be partial data
                }
              }
            }
          }

          // Save assistant message
          if (fullResponse) {
            addConversation(id, 'assistant', fullResponse);
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = await params;
  const project = getComicProject(id);

  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (project.user_id !== auth.user.id) {
    return new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const conversations = getConversations(id);
  return new Response(JSON.stringify({ conversations }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
