import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUserTokens } from '@/lib/db';

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: user.refresh_token,
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET
        })
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { path } = await params;
    const apiPath = path.join('/');
    const response = await fetch(`${process.env.SECONDME_API_BASE}/secondme/${apiPath}`, {
      headers: {
        'Authorization': `Bearer ${auth.user.access_token}`
      }
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch from SecondMe API' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { path } = await params;
    const apiPath = path.join('/');
    const body = await request.json();
    const response = await fetch(`${process.env.SECONDME_API_BASE}/secondme/${apiPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.user.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch from SecondMe API' }, { status: 500 });
  }
}
