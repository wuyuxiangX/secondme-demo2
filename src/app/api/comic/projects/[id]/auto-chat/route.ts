import { NextRequest } from 'next/server';
import {
  getUserById,
  getComicProject,
  updateComicProject,
  addConversation,
  updateUserTokens,
} from '@/lib/db';
import { proxyFetch } from '@/lib/proxy-fetch';

const INTERVIEWER_PROMPT = `你是一位友善、富有同理心的人生故事采访者。你的任务是通过对话了解用户的人生经历，为创作一幅综合性的人生漫画做准备。

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

你现在开始采访，请友好地介绍自己和这次对话的目的，然后邀请用户分享他们的故事。`;

const INTERVIEWEE_PROMPT = `你是用户的 AI 分身，代表用户回答关于人生故事的问题。
请根据你对用户的了解，以第一人称自然地回答采访者的问题。
如果某些信息你不确定，可以根据用户的性格和背景合理推测，创造一个有趣且真实感的回答。
回答要真实、有细节、有情感，像是在讲述自己的故事。
每次回答保持适中的长度，不要太短也不要太长。`;

const TOTAL_ROUNDS = 5;

interface ChatResponse {
  content: string;
  sessionId: string;
}

async function refreshTokenIfNeeded(user: {
  id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
}): Promise<string> {
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
        await updateUserTokens(user.id, tokenData.accessToken, tokenData.refreshToken, tokenData.expiresIn);
        return tokenData.accessToken;
      }
    } catch (error) {
      console.error('Auto refresh failed:', error);
    }
  }
  return user.access_token;
}

async function callSecondMeChat(
  accessToken: string,
  message: string,
  sessionId: string | null,
  systemPrompt?: string
): Promise<ChatResponse> {
  const response = await proxyFetch(`${process.env.SECONDME_API_BASE}/secondme/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      ...(sessionId && { sessionId }),
      ...(systemPrompt && { systemPrompt }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SecondMe API error: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let newSessionId = sessionId || '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === 'event: session') {
        const nextLine = lines[++i]?.trim();
        if (nextLine && nextLine.startsWith('data: ')) {
          try {
            const sessionData = JSON.parse(nextLine.slice(6));
            if (sessionData.sessionId) {
              newSessionId = sessionData.sessionId;
            }
          } catch {
            // Failed to parse session data
          }
        }
        continue;
      }

      if (line === 'event: content' || line === 'event: done') {
        continue;
      }

      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.content || parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
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
          const content = parsed.content || parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
          }
        } catch {
          // Not valid JSON
        }
      }
    }
  }

  return {
    content: fullContent,
    sessionId: newSessionId,
  };
}

async function getAuthenticatedUser(request: NextRequest) {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return { error: 'Authentication required', status: 401 };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { error: 'User not found', status: 401 };
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

  // Get fresh access token
  const accessToken = await refreshTokenIfNeeded(auth.user);

  // Update project status to chatting
  if (project.status === 'draft') {
    await updateComicProject(id, { status: 'chatting' });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let interviewerSessionId: string | null = null;
        let intervieweeSessionId: string | null = null;
        let lastAnswer = '';

        for (let round = 0; round < TOTAL_ROUNDS; round++) {
          // Send round start event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'round_start', round: round + 1, total: TOTAL_ROUNDS })}\n\n`
            )
          );

          // Interviewer generates question
          const interviewerMessage =
            round === 0
              ? '请开始采访'
              : `用户的回答：${lastAnswer}。请根据这个回答，继续采访下一个问题。`;

          const questionResponse = await callSecondMeChat(
            accessToken,
            interviewerMessage,
            interviewerSessionId,
            round === 0 ? INTERVIEWER_PROMPT : undefined
          );

          interviewerSessionId = questionResponse.sessionId;
          const question = questionResponse.content;

          // Save and stream the question
          await addConversation(id, 'assistant', question);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'question', content: question, round: round + 1 })}\n\n`
            )
          );

          // AI interviewee answers the question
          const answerResponse = await callSecondMeChat(
            accessToken,
            question,
            intervieweeSessionId,
            round === 0 ? INTERVIEWEE_PROMPT : undefined
          );

          intervieweeSessionId = answerResponse.sessionId;
          const answer = answerResponse.content;
          lastAnswer = answer;

          // Save and stream the answer
          await addConversation(id, 'user', answer);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'answer', content: answer, round: round + 1 })}\n\n`
            )
          );
        }

        // Send completion event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('Auto-chat error:', error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
          )
        );
        controller.close();
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
}
