import { NextRequest } from 'next/server';
import {
  getUserById,
  getComicProject,
  updateComicProject,
  getPanels,
  updatePanel,
} from '@/lib/db';
import { generateImage, buildPanelPrompt } from '@/lib/openrouter';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = getUserById(userId);
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 401,
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

  if (project.user_id !== userId) {
    return new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const panels = getPanels(id);

  if (panels.length === 0) {
    return new Response(JSON.stringify({ error: 'No panels to generate' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update project status to generating
  updateComicProject(id, { status: 'generating' });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const characterDesc = project.character_desc || '一位普通人';
        const style = project.style || 'chinese';

        for (let i = 0; i < panels.length; i++) {
          const panel = panels[i];

          // Send progress update
          sendEvent({
            type: 'progress',
            panel_id: panel.id,
            panel_order: panel.panel_order,
            total: panels.length,
            status: 'generating',
            title: panel.title,
          });

          // Update panel status to generating
          updatePanel(panel.id, { status: 'generating' });

          // Build the image prompt
          const prompt = buildPanelPrompt(
            panel.title,
            panel.scene_desc,
            characterDesc,
            style
          );

          // Update panel with the prompt
          updatePanel(panel.id, { prompt });

          // Generate the image
          const result = await generateImage(prompt, style);

          if (result.success && result.imageBase64) {
            // Update panel with the image
            updatePanel(panel.id, {
              image_base64: result.imageBase64,
              status: 'completed',
            });

            sendEvent({
              type: 'completed',
              panel_id: panel.id,
              panel_order: panel.panel_order,
              total: panels.length,
              title: panel.title,
              image_base64: result.imageBase64,
            });
          } else {
            // Update panel with failed status
            updatePanel(panel.id, { status: 'failed' });

            sendEvent({
              type: 'error',
              panel_id: panel.id,
              panel_order: panel.panel_order,
              total: panels.length,
              title: panel.title,
              error: result.error || 'Failed to generate image',
            });
          }
        }

        // Update project status to completed
        updateComicProject(id, { status: 'completed' });

        sendEvent({
          type: 'done',
          message: 'All panels generated',
        });

        controller.close();
      } catch (error) {
        console.error('Generation error:', error);

        sendEvent({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Update project status back to analyzing on error
        updateComicProject(id, { status: 'analyzing' });

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
