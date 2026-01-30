import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updateUserTokens } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 使用 x-www-form-urlencoded 格式
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: user.refresh_token,
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!
    });

    const refreshResponse = await fetch(process.env.OAUTH_REFRESH_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: refreshParams.toString()
    });

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.text();
      console.error('Token refresh failed:', errorData);
      return NextResponse.json({ error: 'Failed to refresh token' }, { status: 400 });
    }

    const tokenResult = await refreshResponse.json();

    // 响应格式: {"code": 0, "data": {"accessToken": ..., "refreshToken": ..., ...}}
    if (tokenResult.code !== 0 || !tokenResult.data) {
      console.error('Token refresh response error:', tokenResult);
      return NextResponse.json({ error: 'Token refresh response error' }, { status: 400 });
    }

    const { accessToken, refreshToken, expiresIn } = tokenResult.data;

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
