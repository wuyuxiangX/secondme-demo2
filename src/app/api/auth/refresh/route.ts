import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUserTokens } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

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

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.text();
      console.error('Token refresh failed:', errorData);
      return NextResponse.json({ error: 'Failed to refresh token' }, { status: 400 });
    }

    const tokenData = await refreshResponse.json();
    const { accessToken, refreshToken, expiresIn } = tokenData;

    // Update tokens in database
    updateUserTokens(userId, accessToken, refreshToken, expiresIn);

    return NextResponse.json({
      success: true,
      expiresIn
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}
