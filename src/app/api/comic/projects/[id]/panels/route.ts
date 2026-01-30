import { NextRequest, NextResponse } from 'next/server';
import { getUserById, getComicProject, getPanels } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const project = await getComicProject(id);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const panels = await getPanels(id);
    return NextResponse.json({ panels });
  } catch (error) {
    console.error('Failed to get panels:', error);
    return NextResponse.json({ error: 'Failed to get panels' }, { status: 500 });
  }
}
