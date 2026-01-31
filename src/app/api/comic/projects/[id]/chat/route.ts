import { NextRequest } from 'next/server';
import {
  getUserById,
  getComicProject,
  updateComicProject,
  addConversation,
  getConversations,
  updateUserTokens,
  ComicProject,
} from '@/lib/db';
import { proxyFetch } from '@/lib/proxy-fetch';

const SYSTEM_PROMPT = `你是一位友善、富有同理心的人生故事采访者。你的任务是通过对话了解用户的人生经历，为创作一幅综合性的人生漫画做准备。

你可以从以下几个方面了解用户的故事：
- 成长背景：出生地、家庭、童年记忆
- 重要经历：学习、工作、生活中的关键时刻
- 个人特质：性格、爱好、擅长的事情
- 骄傲时刻：成就、克服的挑战、值得纪念的瞬间
- 未来期望：梦想、目标、期待的生活

对话指南：
- 每次只问1-2个问题，不要一次问太多
- 根据用户的回答自然地深入询问细节
- 用温暖、鼓励的语气
- 帮助用户回忆具体的场景、情感和细节，这些将帮助创作更生动的漫画
- 当收集到足够的信息能够描绘出用户的人生故事后，告诉用户可以点击"完成对话"按钮

开始时，请友好地介绍自己和这次对话的目的，然后邀请用户分享他们的故事。`;

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
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = await params;
  const project = await getComicProject(id);

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
    await addConversation(id, 'user', message);

    // Update project status to chatting
    if (project.status === 'draft') {
      await updateComicProject(id, { status: 'chatting' });
    }

    // Check if this is a new session (no sessionId stored)
    const isNewSession = !project.chat_session_id;

    // Call SecondMe chat API with streaming
    const response = await proxyFetch(`${process.env.SECONDME_API_BASE}/secondme/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.user.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        ...(project.chat_session_id && { sessionId: project.chat_session_id }),
        ...(isNewSession && { systemPrompt: SYSTEM_PROMPT }),
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
    const projectId = id;
    let currentProject: ComicProject | undefined = project;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep the last incomplete line in buffer
            buffer = lines.pop() || '';

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();

              // Handle session event to extract sessionId
              if (line === 'event: session') {
                // Next line should be data with sessionId
                const nextLine = lines[++i]?.trim();
                if (nextLine && nextLine.startsWith('data: ')) {
                  try {
                    const sessionData = JSON.parse(nextLine.slice(6));
                    if (sessionData.sessionId && !currentProject?.chat_session_id) {
                      await updateComicProject(projectId, { chat_session_id: sessionData.sessionId });
                      currentProject = await getComicProject(projectId);
                    }
                  } catch {
                    // Failed to parse session data
                  }
                }
                continue;
              }

              // Handle content event
              if (line === 'event: content') {
                continue;
              }

              // Handle done event
              if (line === 'event: done') {
                continue;
              }

              // Handle data lines
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  // Handle content from the stream
                  const content = parsed.content || parsed.choices?.[0]?.delta?.content || '';
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

          // Process any remaining buffer
          if (buffer.trim()) {
            const line = buffer.trim();
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data !== '[DONE]') {
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.content || parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullResponse += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch {
                  // Not valid JSON
                }
              }
            }
          }

          // Save assistant message
          if (fullResponse) {
            await addConversation(projectId, 'assistant', fullResponse);
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
  const project = await getComicProject(id);

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

  const conversations = await getConversations(id);
  return new Response(JSON.stringify({ conversations }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
